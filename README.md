# 游戏档案 · Game Archive

纯静态个人游戏目录。封面墙、双 Top 10、游戏状态及类型筛选、详情页和本地编辑均可用。

## 运行

把本仓库上传到 GitHub，进入 **Settings → Pages**，选择 **Deploy from a branch → main → /(root)**。

也可以在当前目录运行：

```bash
python3 -m http.server 8000
```

在浏览器打开 `http://localhost:8000`。

## 更新游戏清单

- 所有条目、榜单、推荐理由在 `data/games.json`。
- 点击右上角「管理」→「编辑模式」，点击封面可修改条目。
- 修改默认只储存在当前浏览器。修改完在「管理」中**导出 JSON**，覆盖 `data/games.json` 后提交 GitHub。公开网站才会更新。
- 外链封面可能受网络限制。可以将自己有权使用的图片放在 `assets/covers/`，然后在游戏的 `cover` 字段填写 `./assets/covers/文件名.jpg`。
- 若曾打开旧版并编辑过，它可能从 localStorage 加载旧版数据；「管理 → 恢复初始数据」可清除。

技术：HTML、CSS 和原生 JavaScript；无需 Node 或后端。GitHub Pages 可直接部署。
