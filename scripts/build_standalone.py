#!/usr/bin/env python3
"""Embed HTML/CSS/JS/JSON and local WebP assets into one offline-viewable HTML.

The actual GitHub Pages project continues to use separate local WebP files.
"""
import argparse
import base64
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--output',default=str(ROOT/'game_archive_offline_preview.html'))
    a=ap.parse_args()
    html=(ROOT/'index.html').read_text('utf-8')
    css=(ROOT/'styles.css').read_text('utf-8')
    js=(ROOT/'app.js').read_text('utf-8')
    data=(ROOT/'data/games.json').read_text('utf-8')
    covers={}
    for game in json.loads(data)['games']:
        path=game['cover']
        if not path.startswith('./assets/covers/'):
            continue
        actual=ROOT/path[2:]
        if not actual.is_file(): continue
        covers[path]='data:image/webp;base64,'+base64.b64encode(actual.read_bytes()).decode('ascii')
    # Avoid literal closing script tags in embedded source.
    safe_data=data.replace('<','\\u003c')
    safe_covers=json.dumps(covers,ensure_ascii=True).replace('<','\\u003c')
    html=html.replace('  <link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">\n','')
    html=html.replace('  <link rel="stylesheet" href="./styles.css">','  <style>\n'+css+'\n</style>')
    html=html.replace('  <script src="./app.js" defer></script>','')
    html=html.replace('</body>',f'<script id="game-archive-data" type="application/json">\n{safe_data}\n</script>\n<script>window.__GAME_ARCHIVE_COVERS__={safe_covers};</script>\n<script>\n{js}\n</script>\n</body>')
    out=Path(a.output)
    out.write_text(html,'utf-8')
    print('created',out,round(out.stat().st_size/1024,1),'KiB',len(covers),'embedded WebP')

if __name__=='__main__':main()
