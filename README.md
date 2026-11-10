# 游戏档案

纯静态个人游戏目录，无后端、无构建依赖。82 条记录、两份 Top 10、类型与状态筛选、详细信息编辑。

打开网站默认显示 **当期推荐游玩**；另一页为 **心中 Top 10**。

## 部署到 GitHub Pages

1. 新建 GitHub 仓库，把 ZIP 解压后的所有文件上传到仓库根目录。
2. 在仓库 `Settings → Pages` 选择 `Deploy from a branch → main → /(root)`。
3. 保存后使用 `https://用户名.github.io/仓库名/` 访问。

## 图片：100% 本地 WebP

- `assets/covers/game-001.webp` 等 **82 个文件已经在仓库里**。
- `data/games.json` 的 `cover` 字段全部使用 `./assets/covers/*.webp`，用户浏览网站时不需要请求任何第三方封面服务器。
- **初始自带的是离线占位图，不是正版游戏封面。** 由于创建环境无法访问第三方图片服务器，真实封面需要在有网络的电脑上，或在 GitHub Actions 执行一次下载。
- 有封面的优先从提供的地址 / Steam 商店 / Bangumi 获取；脚本把图片裁切或适配成 480×720 WebP，写入本地文件。源站拒绝访问或没有来源的条目保留占位图。
- 来源映射在 `data/cover_sources.json`；下载情况在 `data/cover_status.json`。可以手动更改 `directUrls`，再用 `--force` 重下，或直接替换对应的 `.webp` 文件。

### 推荐方式：GitHub Actions 一次性抓取

上传仓库后，打开 **Actions → Fetch game covers as local WebP → Run workflow**。工作流会自动：

1. 下载可获取的封面并转成 WebP；
2. 把下载到的图片写进 `assets/covers/`；
3. 把结果提交回仓库（需要仓库允许 Actions 写入）。

运行完成后，GitHub Pages 发布的页面就只读取提交在仓库里的 WebP 了。

### 本地运行下载脚本

```bash
python -m pip install -r requirements-covers.txt
python scripts/fetch_covers.py
# 已经下载过的真实封面默认跳过；若更新源地址可以重抓
python scripts/fetch_covers.py --force
```

网站本身不需要 Python，只有本地**下载封面**这一步才用到 Python + Pillow + requests。

## 后续增删游戏

1. 在网页右上角 **管理** 进入编辑，补充状态、评分和推荐理由。
2. 点击 **导出 JSON**，覆盖仓库里的 `data/games.json`。
3. 运行 `python scripts/sync_cover_sources.py`，会为新游戏创建 WebP 占位图和对应下载源。
4. 运行 `python scripts/fetch_covers.py`，再提交文件；或使用 GitHub Actions 完成 3～4 步。

若旧版曾在浏览器内修改游戏信息，会自动沿用旧版编辑，并将旧的远程封面地址迁移为已收录的本地封面路径。管理界面可恢复仓库数据。

## 离线 HTML 预览

`python scripts/build_standalone.py` 可生成一个可离线双击打开的 HTML 文件，**连 WebP 都嵌在单文件里**。每次真实封面更新后可重新生成。完整网站部署仍推荐独立图片文件的 GitHub Pages 版本。

封面素材的版权归原权利人所有。将原版封面上传到公开仓库前，请自行评估展示和再分发条件。
