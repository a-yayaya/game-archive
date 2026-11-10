#!/usr/bin/env python3
"""Ensure every game ID has a local WebP and a corresponding source entry."""
import json
import re
from pathlib import Path
from create_placeholders import draw_placeholder
ROOT=Path(__file__).resolve().parents[1]


def write_json_if_changed(path: Path, value) -> bool:
    new=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    if path.exists() and path.read_text('utf-8')==new:return False
    path.write_text(new,'utf-8');return True


def sync() -> int:
    dp=ROOT/'data/games.json'
    sp=ROOT/'data/cover_sources.json'
    stp=ROOT/'data/cover_status.json'
    data=json.loads(dp.read_text('utf-8'))
    sources=json.loads(sp.read_text('utf-8')) if sp.exists() else {}
    status=json.loads(stp.read_text('utf-8')) if stp.exists() else {}
    added=0
    for g in data['games']:
        gid=g['id']
        if not re.fullmatch(r'[a-zA-Z0-9_-]+',gid):
            raise ValueError(f'不安全的游戏 ID：{gid}')
        if gid not in sources:
            match=re.search(r'bgm\.tv/subject/(\d+)',g.get('link',''))
            old_cover=g.get('cover') or ''
            sources[gid]={
                'title':g['title'],
                'directUrls':[old_cover] if old_cover.startswith('https://') else [],
                'steamId':g.get('steamId'),
                'bangumiId':int(match.group(1)) if match else None,
            }
            added+=1
        else:
            sources[gid]['title']=g['title']
            if g.get('steamId'): sources[gid]['steamId']=g['steamId']
        path=ROOT/'assets/covers'/f'{gid}.webp'
        if not path.is_file():draw_placeholder(g['title'],path)
        if gid not in status:status[gid]={'status':'placeholder','source':'local generated fallback'}
        g['cover']=f'./assets/covers/{gid}.webp'
    # Remove unlinked entries from the source inventory only (do not delete assets).
    ids={g['id'] for g in data['games']}
    sources={k:v for k,v in sources.items() if k in ids}
    write_json_if_changed(dp,data)
    write_json_if_changed(sp,sources)
    write_json_if_changed(stp,status)
    return added

if __name__=='__main__':
    print(f'同步完成；新增 {sync()} 条封面源记录。')
