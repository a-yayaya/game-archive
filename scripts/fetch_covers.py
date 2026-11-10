#!/usr/bin/env python3
"""One-time download of official storefront images to local WebP files.

The website itself NEVER requests third-party cover URLs at runtime.
Run once from an internet-connected machine, or via GitHub Actions.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json
import os
from pathlib import Path
import threading
from PIL import Image, ImageOps, ImageFilter, UnidentifiedImageError
import requests
from sync_cover_sources import sync

ROOT=Path(__file__).resolve().parents[1]
COVERS=ROOT/'assets/covers'
DATA=ROOT/'data/games.json'
SOURCES=ROOT/'data/cover_sources.json'
STATUS=ROOT/'data/cover_status.json'
HEADERS={'User-Agent':'GameArchiveCoverFetcher/1.0 (personal noncommercial catalog; image cache)', 'Accept':'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.1'}
TIMEOUT=(7,18)
MAX_BYTES=12*1024*1024
TARGET=(480,720)
print_lock=threading.Lock()


def retrieve(url: str) -> bytes:
    response=requests.get(url,headers=HEADERS,timeout=TIMEOUT,stream=True,allow_redirects=True)
    response.raise_for_status()
    length=0;chunks=[]
    for chunk in response.iter_content(131072):
        if not chunk:continue
        length+=len(chunk)
        if length>MAX_BYTES:raise ValueError('图片超过 12 MB')
        chunks.append(chunk)
    payload=b''.join(chunks)
    if len(payload)<1500:raise ValueError('文件过小，不像游戏封面')
    return payload


def parse_image(payload: bytes) -> Image.Image:
    img=Image.open(BytesIO(payload))
    if img.format not in ('JPEG','PNG','WEBP','AVIF','BMP','GIF'):
        raise ValueError(f'不是支持的图片格式: {img.format}')
    if img.width<170 or img.height<170:
        raise ValueError(f'图像太小: {img.size}')
    if img.width*img.height>44_000_000:
        raise ValueError('像素数量太大')
    return ImageOps.exif_transpose(img).convert('RGB')


def poster_image(img: Image.Image) -> Image.Image:
    w,h=img.size
    if .55 <= w/h <= .9:
        return ImageOps.fit(img,TARGET,method=Image.Resampling.LANCZOS,centering=(.5,.5))
    backdrop=ImageOps.fit(img,TARGET,method=Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(28))
    backdrop=Image.blend(backdrop,Image.new('RGB',TARGET,(16,17,19)),.35)
    contained=ImageOps.contain(img,TARGET,method=Image.Resampling.LANCZOS)
    px=(TARGET[0]-contained.width)//2
    py=(TARGET[1]-contained.height)//2
    backdrop.paste(contained,(px,py))
    return backdrop


def bangumi_cover(bid: int) -> str|None:
    try:
        rsp=requests.get(f'https://api.bgm.tv/v0/subjects/{bid}',headers={'User-Agent':'GameArchiveCoverFetcher/1.0 (+https://github.com/)','Accept':'application/json'},timeout=TIMEOUT)
        rsp.raise_for_status()
        obj=rsp.json()
        images=obj.get('images') or {}
        return images.get('large') or images.get('common')
    except Exception:
        return None


def candidates(src: dict) -> list[str]:
    urls=[u for u in src.get('directUrls',[]) if isinstance(u,str) and u.startswith('https://')]
    steam=src.get('steamId')
    if steam:
        steam=int(steam)
        urls+= [
            f'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{steam}/library_600x900_2x.jpg',
            f'https://cdn.cloudflare.steamstatic.com/steam/apps/{steam}/library_600x900.jpg',
            f'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{steam}/library_600x900.jpg',
            f'https://cdn.akamai.steamstatic.com/steam/apps/{steam}/library_600x900.jpg',
            f'https://cdn.cloudflare.steamstatic.com/steam/apps/{steam}/header.jpg',
        ]
    return list(dict.fromkeys(urls))


def process(item: tuple[str,dict], old_status: dict, force: bool) -> tuple[str,str,str]:
    gid,src=item
    path=COVERS/f'{gid}.webp'
    if not force and old_status.get(gid,{}).get('status')=='downloaded' and path.exists():
        return (gid,'downloaded',old_status[gid].get('source','cached'))
    urls=candidates(src)
    bangumi_id=src.get('bangumiId')
    if not urls and bangumi_id:
        cover=bangumi_cover(int(bangumi_id))
        if cover and cover.startswith('https://'): urls=[cover]
        bangumi_id=None
    attempted=set()
    while urls:
        url=urls.pop(0)
        if url in attempted:continue
        attempted.add(url)
        try:
            pic=poster_image(parse_image(retrieve(url)))
            temp=path.with_suffix('.webp.part')
            pic.save(temp,format='WEBP',quality=82,method=5)
            os.replace(temp,path)
            return (gid,'downloaded',url)
        except (requests.RequestException,UnidentifiedImageError,OSError,ValueError):
            pass
        if not urls and bangumi_id:
            cover=bangumi_cover(int(bangumi_id))
            bangumi_id=None
            if cover and cover.startswith('https://') and cover not in attempted:
                urls.append(cover)
    return (gid,'placeholder','download failed or no public source')


def main() -> None:
    ap=argparse.ArgumentParser(description='一次性把封面下载并转换为仓库内的 WebP。')
    ap.add_argument('--workers',type=int,default=6)
    ap.add_argument('--force',action='store_true',help='重新下载已成功下载的封面')
    args=ap.parse_args()
    added=sync()
    if added: print(f'发现 {added} 条新游戏，已创建对应本地封面。')
    manifest=json.loads(SOURCES.read_text('utf-8'))
    state=json.loads(STATUS.read_text('utf-8'))
    with ThreadPoolExecutor(max_workers=max(1,min(12,args.workers))) as pool:
        futures={pool.submit(process,item,state,args.force):item[0] for item in manifest.items()}
        for fut in as_completed(futures):
            gid,status,src=fut.result()
            state[gid]={'status':status,'source':src}
            with print_lock:
                print(f'{"✓" if status=="downloaded" else "·"} {gid}: {status}',flush=True)
    STATUS.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n','utf-8')
    n=sum(v['status']=='downloaded' for v in state.values())
    print(f'完成：{n}/{len(manifest)} 张真实封面，剩余 {len(manifest)-n} 张使用本地占位图。')

if __name__=='__main__':main()
