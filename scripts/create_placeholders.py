#!/usr/bin/env python3
"""Build monochrome WebP placeholders. No network required.

Placeholders are never mistaken for downloaded cover art: data/cover_status.json
records the source type and fetch_covers.py can replace them in-place later.
"""
from __future__ import annotations
import colorsys
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
COVERS = ROOT / 'assets' / 'covers'
FONT_FILE = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
if not Path(FONT_FILE).exists():
    FONT_FILE = None


def initials(title: str) -> str:
    clean = title.replace('：', ' ').replace('（', ' ').replace('·', ' ').strip()
    if clean and '\u4e00' <= clean[0] <= '\u9fff':
        return ''.join(c for c in clean if '\u4e00' <= c <= '\u9fff')[:2] or clean[:2]
    words = [x for x in clean.replace('-', ' ').split() if x]
    return (''.join(x[0].upper() for x in words[:2]) if len(words) > 1 else clean[:2].upper()) or '—'


def draw_placeholder(name: str, out: Path) -> None:
    digest = hashlib.sha256(name.encode('utf-8')).digest()
    width, height = 480, 720
    # Restrained muted palette; no fake copyrighted cover images.
    hue = digest[0] / 255.0
    r,g,b = colorsys.hls_to_rgb(hue, .185, .16)
    top = tuple(int(c*255) for c in (r,g,b))
    bottom = tuple(max(10,int(x*.54)) for x in top)
    canvas=Image.new('RGB',(width,height))
    px=canvas.load()
    for y in range(height):
        t=y/(height-1)
        for x in range(width):
            edge=(x/width-.5)**2
            px[x,y]=tuple(max(0,min(255,round(top[i]*(1-t)+bottom[i]*t-7*edge))) for i in range(3))
    art=Image.new('RGBA',(width,height),(0,0,0,0))
    draw=ImageDraw.Draw(art)
    # Offset thin rings, consistent but distinctive for each placeholder.
    xoff=int((digest[1]-128)*.6)
    yoff=int((digest[2]-128)*.7)
    for j in range(5):
        radius=140+72*j
        x=240+xoff; y=330+yoff
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),outline=(230,231,235,max(5,25-3*j)),width=2)
    # A compact motif in the corner instead of placeholder copy.
    for i in range(6):
        y=50+i*7
        draw.line((44,y,44+14+i*10,y), fill=(220,222,225,17),width=1)
    canvas=Image.alpha_composite(canvas.convert('RGBA'),art)
    draw=ImageDraw.Draw(canvas)
    monogram=initials(name)
    font=ImageFont.truetype(FONT_FILE,93) if FONT_FILE else ImageFont.load_default()
    bbox=draw.textbbox((0,0),monogram,font=font)
    tw=bbox[2]-bbox[0]
    draw.text(((width-tw)/2,300-bbox[1]),monogram,font=font,fill=(223,224,224,200))
    draw.line((40,649,440,649),fill=(245,245,245,32),width=1)
    # Tiny horizontal marker uses no decorative slogans.
    draw.rounded_rectangle((40,666,87,670),radius=2,fill=(240,240,240,85))
    out.parent.mkdir(parents=True,exist_ok=True)
    canvas.convert('RGB').save(out,format='WEBP',quality=78,method=6)


def main():
    data=json.loads((ROOT/'data/games.json').read_text('utf-8'))
    state_file=ROOT/'data/cover_status.json'
    state=json.loads(state_file.read_text('utf-8')) if state_file.exists() else {}
    for g in data['games']:
        out=COVERS/(g['id']+'.webp')
        # Never overwrite real downloaded art or user-supplied covers.
        if out.exists() and state.get(g['id'],{}).get('status')=='downloaded':
            continue
        if not out.exists():
            draw_placeholder(g['title'],out)
        state.setdefault(g['id'],{'status':'placeholder','source':'local generated fallback'})
    state_file.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(f'本地封面就绪：{len(data["games"])} 个；真实封面可运行 scripts/fetch_covers.py 下载后覆盖。')

if __name__=='__main__':main()
