/* MY GAME ARCHIVE — pure static-site application. No build step or backend needed. */
(() => {
  'use strict';
  const SOURCE = './data/games.json';
  const STORAGE_KEY = 'game-archive-custom-v1';
  const STATUS = ['待确认', '想玩', '未开始', '正在玩', '已通关', '玩过未通关', '长线游玩', '暂停', '已弃坑'];
  const OWNERSHIP = ['待确认', '已拥有', '未拥有', '订阅可玩', '免费游玩'];
  const PRIORITY = ['', 'S', 'A', 'B', 'C'];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeUrl = (value = '') => { const v = String(value || '').trim(); if (/^(?:\.\/)?assets\/[a-zA-Z0-9_.\/%-]+$/.test(v) && !v.includes('..')) return v; try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const norm = (str) => String(str || '').toLocaleLowerCase().normalize('NFKC');
  const unique = (arr) => Array.from(new Set(arr));
  const deepCopy = (x) => JSON.parse(JSON.stringify(x));
  const slug = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 60) || 'game';
  // Official cover sources override brittle Steam library artwork when needed.
  // When available, place your own image in assets/covers and set game.cover to that path.
  const COVER_OVERRIDES = {
    '影之刃零': [
      'https://image.api.playstation.com/vulcan/ap/rnd/202607/2810/5d34d0cd910fa48c730a1915b8cf112231c30e667e2169ea.jpg',
      'https://image.api.playstation.com/vulcan/ap/rnd/202512/1205/4b8cdac83d4ee1c8ee44a27205d1965dac52bcd127d071a0.jpg',
      'https://static.wixstatic.com/media/560d55_14483b388cd446c09c7fdd1851a73e17~mv2.jpg/v1/fill/w_2500,h_1406,al_c/560d55_14483b388cd446c09c7fdd1851a73e17~mv2.jpg',
    ],
  };
  const palettes = [ ['#293846','#152d35'], ['#51382f','#282532'], ['#33413a','#1b2d2f'], ['#4d3643','#242532'], ['#423c2c','#242c35'], ['#243a44','#183a3a'], ['#433c45','#242c37'], ['#3d4736','#242d24'] ];
  const state = { data: null, original: null, rank: 'favorites', quick: 'all', query: '', genre: '全部', status: '全部', sort: 'default', editMode: false, modalGameId: null };
  let toastHandle;

  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastHandle); toastHandle = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function normalizeData(raw) {
    if (!raw || !Array.isArray(raw.games) || raw.games.length > 5000) throw new Error('不是有效的游戏清单 JSON');
    const games = raw.games.map((g, i) => {
      if (!g || typeof g.title !== 'string' || !g.title.trim()) throw new Error(`第 ${i+1} 款游戏缺少名称`);
      return {
        id: String(g.id || `game-${i+1}`), title: g.title.trim(), genre: String(g.genre || '其他'),
        tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
        status: STATUS.includes(g.status) ? g.status : '待确认',
        ownership: OWNERSHIP.includes(g.ownership) ? g.ownership : '待确认',
        platform: String(g.platform || ''), priority: PRIORITY.includes(g.priority) ? g.priority : '',
        hours: g.hours === '' || g.hours == null ? null : Number(g.hours),
        rating: g.rating === '' || g.rating == null ? null : Number(g.rating),
        year: String(g.year || ''), note: String(g.note || ''), privateNote: String(g.privateNote || ''),
        link: safeUrl(g.link), cover: safeUrl(g.cover),
        steamId: Number.isInteger(Number(g.steamId)) && g.steamId ? Number(g.steamId) : null
      };
    });
    if (new Set(games.map(g => g.id)).size !== games.length) throw new Error('存在重复的游戏 ID');
    const available = new Set(games.map(g => g.id));
    return {
      meta: { siteTitle: String(raw.meta?.siteTitle || 'MY GAME ARCHIVE'), tagline: String(raw.meta?.tagline || ''), updated: String(raw.meta?.updated || ''), owner: String(raw.meta?.owner || ''), description: String(raw.meta?.description || '') },
      games,
      favoriteIds: unique((Array.isArray(raw.favoriteIds) ? raw.favoriteIds : []).map(String)).filter(id => available.has(id)).slice(0, 10),
      recommendationIds: unique((Array.isArray(raw.recommendationIds) ? raw.recommendationIds : []).map(String)).filter(id => available.has(id)).slice(0, 10),
      recommendationNotes: (raw.recommendationNotes && typeof raw.recommendationNotes === 'object' && !Array.isArray(raw.recommendationNotes)) ? raw.recommendationNotes : {},
    };
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data)); $('#save-status').textContent = '已保存到此浏览器 · 记得导出 JSON'; }
    catch { toast('当前浏览器无法保存，请立即导出 JSON'); }
    render();
  }
  function getGame(id) { return state.data.games.find(g => g.id === id); }
  function hash(text) { let h = 0; for (let i=0;i<text.length;i++) h = (h*31 + text.charCodeAt(i))|0; return Math.abs(h); }
  function buildCover(game, eager=false) {
    const colors = palettes[hash(game.title) % palettes.length];
    const wrapper = document.createElement('div'); wrapper.className = 'cover-shell';
    wrapper.style.setProperty('--cover-a', colors[0]); wrapper.style.setProperty('--cover-b', colors[1]);
    const fallback = document.createElement('div'); fallback.className = 'cover-fallback';
    fallback.innerHTML = `<strong class="fallback-title">${escapeHtml(game.title)}</strong><span class="fallback-bottom">${escapeHtml(game.genre)}</span>`;
    wrapper.append(fallback);
    const selectedCover = safeUrl(game.cover);
    const sources = selectedCover.startsWith('assets/') ? [selectedCover] : [];
    sources.push(...(COVER_OVERRIDES[game.title] || []));
    if (selectedCover && !sources.includes(selectedCover)) sources.push(selectedCover);
    if (game.steamId) {
      const base = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.steamId}/`;
      sources.push(base + 'library_600x900_2x.jpg', base + 'library_600x900.jpg', `https://cdn.akamai.steamstatic.com/steam/apps/${game.steamId}/library_600x900.jpg`, base + 'header.jpg');
    }
    if (sources.length) {
      const img = document.createElement('img'); img.className = 'cover-image';
      img.alt = `《${game.title}》游戏封面`; img.loading = eager ? 'eager' : 'lazy'; img.decoding = 'async';
      let i = 0;
      img.onload = () => wrapper.classList.add('has-image');
      img.onerror = () => { wrapper.classList.remove('has-image'); if (++i < sources.length) img.src = sources[i]; else img.remove(); };
      img.src = sources[0]; wrapper.append(img);
    }
    return wrapper;
  }
  function makeCover(g, className, eager) {
    const element = document.createElement('div'); element.className = className; element.append(buildCover(g, eager)); return element;
  }
  function rankList(which) { return which === 'recommendations' ? state.data.recommendationIds : state.data.favoriteIds; }
  function getRankNote(g, which) {
    if (which === 'recommendations') return String(state.data.recommendationNotes?.[g.id] || '');
    return g.note || '';
  }
  function renderRanks() {
    $$('.rank-tab').forEach(btn => {
      const active = btn.dataset.rank === state.rank;
      btn.classList.toggle('is-active', active); btn.setAttribute('aria-selected', String(active));
    });
    $('#rank-caption').textContent = state.rank === 'favorites' ? '心中最爱 Top 10' : '推荐游玩 Top 10';
    const wrap = $('#rank-scroll'); wrap.replaceChildren();
    rankList(state.rank).forEach((id, i) => {
      const g = getGame(id); if (!g) return;
      const item = document.createElement('article'); item.className='rank-card'; item.setAttribute('role','button'); item.tabIndex=0;
      item.setAttribute('aria-label', `第${i+1}名，${g.title}，查看详情`);
      const cover=makeCover(g,'rank-cover', i < 3);
      const number=document.createElement('span');number.className='rank-number';number.textContent=String(i+1).padStart(2,'0');cover.append(number);
      const title=document.createElement('div');title.className='rank-title';title.textContent=g.title;
      const genre=document.createElement('div');genre.className='rank-genre';genre.textContent=g.genre + (g.rating!=null?'  ·  '+g.rating+'/10':'');
      item.append(cover,title,genre);
      const note=state.rank === 'recommendations' ? getRankNote(g,state.rank) : '';
      if(note){const p=document.createElement('p');p.className='rank-note';p.textContent=note;item.append(p);}
      item.addEventListener('click',()=>openGame(g.id));
      item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGame(g.id);}});
      wrap.append(item);
    });
  }
  function populateGenres() {
    const select = $('#genre-select');
    const current=select.value;
    select.replaceChildren(new Option('全部类型','全部'),...unique(state.data.games.map(g=>g.genre)).sort((a,b)=>a.localeCompare(b,'zh-CN')).map(x=>new Option(x,x)));
    select.value = unique(state.data.games.map(g=>g.genre)).includes(current) ? current : '全部';
  }
  function filteredGames() {
    const f=state.data.favoriteIds;const r=state.data.recommendationIds;
    let arr=state.data.games.map((g,i)=>({...g,_order:i}));
    return arr.filter(g=>{
      if (state.query&&!norm([g.title,g.genre,...g.tags,g.note].join(' ')).includes(norm(state.query))) return false;
      if(state.genre!=='全部'&&g.genre!==state.genre) return false;
      if(state.status!=='全部'&&g.status!==state.status) return false;
      if(state.quick==='favorites'&&!f.includes(g.id))return false;
      if(state.quick==='recommendations'&&!r.includes(g.id))return false;
      if(state.quick==='backlog'&&!['想玩','未开始'].includes(g.status))return false;
      if(state.quick==='reviewed'&&g.rating==null&&!g.note)return false;
      return true;
    }).sort((a,b)=>{
      if(state.sort==='name')return a.title.localeCompare(b.title,'zh-CN');
      if(state.sort==='genre')return a.genre.localeCompare(b.genre,'zh-CN')||a._order-b._order;
      if(state.sort==='rating')return (b.rating??-1)-(a.rating??-1)||a._order-b._order;
      return a._order-b._order;
    });
  }
  function renderLibrary() {
    const games=filteredGames();const grid=$('#games-grid');grid.replaceChildren();
    $('#result-count').textContent=`${games.length} 款`;
    $('#empty-state').hidden=games.length>0;
    games.forEach(g=>{
      const btn=document.createElement('button');btn.type='button';btn.className='game-card';btn.setAttribute('aria-label', `${g.title}，查看${state.editMode?'编辑':'游戏'}详情`);
      const cover=makeCover(g,'game-image',false);
      if(state.data.favoriteIds.includes(g.id)){const tag=document.createElement('span');tag.className='badge-fav';tag.textContent='♥';tag.title='心中 Top 10';cover.append(tag);}
      if(state.data.recommendationIds.includes(g.id)){const tag=document.createElement('span');tag.className='badge-rec';tag.textContent='TOP 10';tag.title='立刻推荐';cover.append(tag);}
      const title=document.createElement('div');title.className='game-title';title.textContent=g.title;
      const sub=document.createElement('div');sub.className='game-subline';
      const genre=document.createElement('span');genre.textContent=g.genre;sub.append(genre);
      if(g.status!=='待确认'){const stat=document.createElement('span');stat.className='game-state';stat.textContent=g.status;sub.append(stat);}
      if(g.rating!=null){const rating=document.createElement('span');rating.className='game-score';rating.textContent=`★ ${g.rating}`;sub.append(rating);}
      btn.append(cover,title,sub);btn.addEventListener('click',()=>openGame(g.id));grid.append(btn);
    });
    $$('.filter-chip').forEach(c=>c.classList.toggle('is-active', c.dataset.filter===state.quick));
  }
  function render() { if(!state.data)return; $('#metric-all').textContent=state.data.games.length; populateGenres();renderRanks();renderLibrary(); }
  function showDialog(dialog){ if(!dialog.open)dialog.showModal();document.body.classList.add('dialog-open'); }
  function closeDialog(dialog){if(dialog.open)dialog.close();document.body.classList.remove('dialog-open');}
  function openGame(id) { state.modalGameId=id; if(state.editMode) openEditor(id); else openDetails(id); }
  function openDetails(id){
    const g=getGame(id);if(!g)return;
    const root=$('#dialog-body');root.replaceChildren();
    const el=document.createElement('div');el.className='detail-inner';
    const left=makeCover(g,'detail-cover',true);
    const right=document.createElement('div');
    const favored=state.data.favoriteIds.indexOf(id);const recommended=state.data.recommendationIds.indexOf(id);
    const note=state.data.recommendationNotes[id];
    right.innerHTML = `<p class="detail-kicker">${favored>=0?`♥  心中 Top ${favored+1}`:recommended>=0?`↗  立刻推荐 Top ${recommended+1}`:''}</p>
      <h2 class="detail-title">${escapeHtml(g.title)}</h2><div class="detail-tags">${[g.genre,...g.tags].map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div>
      <div class="detail-info"><div><small>游玩状态</small>${escapeHtml(g.status)}</div><div><small>获取状态</small>${escapeHtml(g.ownership)}</div><div><small>平台</small>${escapeHtml(g.platform||'待补充')}</div><div><small>个人评分</small>${g.rating==null?'待补充':escapeHtml(g.rating)+'/10'}</div><div><small>游玩时长</small>${g.hours==null?'待补充':escapeHtml(g.hours)+' 小时'}</div><div><small>愿望优先级</small>${escapeHtml(g.priority||'—')}</div></div>
      ${(g.note||note)?`<p class="detail-note">${escapeHtml(g.note||note)}</p>`:''}<div class="detail-actions"></div>`;
    const actions=$('.detail-actions',right);
    if(g.link){const a=document.createElement('a');a.className='small-link';a.href=g.link;a.target='_blank';a.rel='noopener noreferrer';a.textContent='查看作品介绍 ↗';actions.append(a);}
    if(g.steamId){const a=document.createElement('a');a.className='small-link';a.href=`https://store.steampowered.com/app/${g.steamId}/`;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Steam 页面 ↗';actions.append(a);}
    const edit=document.createElement('button');edit.className='outline-button';edit.textContent='编辑这款游戏 ✎';edit.addEventListener('click',()=>{closeDialog($('#game-dialog'));openEditor(id);});actions.append(edit);
    el.append(left,right);root.append(el);showDialog($('#game-dialog'));
  }
  function optionHtml(options,value){return options.map(x=>`<option value="${escapeHtml(x)}" ${x===value?'selected':''}>${escapeHtml(x||'未设定')}</option>`).join('');}
  function setRankPosition(list,id,checked,index){
    const at=list.indexOf(id);if(at>=0)list.splice(at,1);
    if(checked){if(list.length>=10){toast('每份 Top 10 最多 10 款，请先移除一款');return false;}
      const n=String(index).trim()===''?NaN:Number(index);list.splice(Number.isFinite(n)&&n>=1?Math.max(0,Math.min(list.length,n-1)):list.length,0,id);
    }return true;
  }
  function openEditor(id=null) {
    const old=id ? getGame(id) : null;if(id&&!old)return;
    const g=old||{title:'',genre:'动作',tags:[],status:'待确认',ownership:'待确认',platform:'',priority:'',hours:null,rating:null,year:'',note:'',privateNote:'',link:'',cover:'',steamId:null};
    const rankFav=id?state.data.favoriteIds.indexOf(id)+1:0,rankRec=id?state.data.recommendationIds.indexOf(id)+1:0;
    const container=$('#dialog-body');container.replaceChildren();
    const form=document.createElement('form');form.className='edit-form';
    const genreOptions=unique([...state.data.games.map(x=>x.genre),'其他']).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    form.innerHTML=`<div class="detail-kicker">${old?'EDIT GAME':'NEW GAME'}</div><h2 class="edit-heading">${old?'编辑游戏':'添加游戏'}</h2>
      <div class="form-grid">
      <label class="field wide">游戏名称 <input name="title" value="${escapeHtml(g.title)}" required maxlength="150"></label>
      <label class="field">主类型<select name="genre">${optionHtml(genreOptions,g.genre)}</select></label>
      <label class="field">游玩状态<select name="status">${optionHtml(STATUS,g.status)}</select></label>
      <label class="field">获取状态<select name="ownership">${optionHtml(OWNERSHIP,g.ownership)}</select></label>
      <label class="field">想玩优先级<select name="priority">${optionHtml(PRIORITY,g.priority)}</select></label>
      <label class="field wide">玩法标签（用逗号分隔）<input name="tags" value="${escapeHtml(g.tags.join('、'))}" placeholder="剧情向、魂系、探索"></label>
      <label class="field">游戏平台 <input name="platform" value="${escapeHtml(g.platform)}" placeholder="PC、Switch、PS5"></label>
      <label class="field">游玩年份 <input name="year" value="${escapeHtml(g.year)}" placeholder="2025" maxlength="30"></label>
      <label class="field">评分（0～10，可空） <input name="rating" type="number" value="${g.rating??''}" min="0" max="10" step="0.5"></label>
      <label class="field">游玩时长（小时，可空） <input name="hours" type="number" value="${g.hours??''}" min="0" step="0.5"></label>
      <label class="field wide">一句话评价 / 心得<textarea name="note" rows="3" placeholder="记录你为什么喜欢（或不喜欢）这款游戏">${escapeHtml(g.note)}</textarea></label>
      <label class="field wide">作品介绍链接（Bangumi 等）<input name="link" type="url" value="${escapeHtml(g.link)}" placeholder="https://bgm.tv/subject/..."></label>
      <label class="field wide">自定义封面 URL（可空）<input name="cover" type="text" value="${escapeHtml(g.cover)}" placeholder="https://.../cover.jpg 或 ./assets/covers/xxx.jpg"></label>
      <label class="field">Steam App ID（可空）<input name="steamId" type="number" min="1" value="${g.steamId??''}" placeholder="例如 367520"></label>
      <label class="field">整理备注（不在页面显示，但会包含在公开 JSON 中）<input name="privateNote" value="${escapeHtml(g.privateNote)}"></label>
      </div>
      <div class="form-checkboxes"><label><input name="favorite" type="checkbox" ${rankFav?'checked':''}> ♥ 心中 Top 10</label><label><input name="recommendation" type="checkbox" ${rankRec?'checked':''}> ↗ 立刻推荐 Top 10</label></div>
      <div class="form-grid"><label class="field">心中榜单名次（1～10）<input name="favPos" type="number" min="1" max="10" value="${rankFav||''}" placeholder="留空则排在最后"></label>
      <label class="field">推荐榜单名次（1～10）<input name="recPos" type="number" min="1" max="10" value="${rankRec||''}" placeholder="留空则排在最后"></label>
      <label class="field wide">立刻推荐理由<textarea name="recommendationNote" rows="2" placeholder="推荐给朋友的理由">${escapeHtml(id?(state.data.recommendationNotes[id]||''):'')}</textarea></label></div>
      <p class="form-hint">封面读取顺序：自定义 URL → Steam 封面 → 自动生成的文字封面。游戏编辑保存在当前浏览器，部署更新需导出并提交 JSON。</p>
      <div class="form-controls"><button class="primary-button" type="submit">保存游戏 ✓</button><button class="outline-button" type="button" data-cancel>取消</button><span class="spacer"></span>${old?'<button class="outline-button danger-button" type="button" data-delete>删除游戏</button>':''}</div>`;
    container.append(form);showDialog($('#game-dialog'));
    $('[data-cancel]',form).addEventListener('click',()=>closeDialog($('#game-dialog')));
    if(old)$('[data-delete]',form).addEventListener('click',()=>{
      if(!confirm(`确定删除《${g.title}》吗？`))return;
      state.data.games=state.data.games.filter(x=>x.id!==id);
      state.data.favoriteIds=state.data.favoriteIds.filter(x=>x!==id);
      state.data.recommendationIds=state.data.recommendationIds.filter(x=>x!==id);
      delete state.data.recommendationNotes[id];
      closeDialog($('#game-dialog'));persist();toast('已删除游戏');
    });
    form.addEventListener('submit',e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const fields=new FormData(form),val=(k)=>String(fields.get(k)||'').trim();
      const rating=val('rating')===''?null:Number(val('rating'));
      const hours=val('hours')===''?null:Number(val('hours'));
      if(rating!==null && (rating<0||rating>10)){toast('评分请输入 0 到 10');return;}
      const result={
        ...g,id:old?id:`game-${Date.now().toString(36)}-${Math.floor(Math.random()*9999)}`,
        title:val('title'),genre:val('genre'),status:val('status'),ownership:val('ownership'),priority:val('priority'),
        tags:unique(val('tags').split(/[、，,]/).map(s=>s.trim()).filter(Boolean)),
        platform:val('platform'),year:val('year'),rating,hours,note:val('note'),privateNote:val('privateNote'),
        link:safeUrl(val('link')),cover:safeUrl(val('cover')),steamId:val('steamId')?Number(val('steamId')):null
      };
      const wantFav=fields.has('favorite'),wantRec=fields.has('recommendation');
      if(wantFav&&!state.data.favoriteIds.includes(result.id)&&state.data.favoriteIds.length>=10){toast('心中 Top 10 已满，请先移除一款');return;}
      if(wantRec&&!state.data.recommendationIds.includes(result.id)&&state.data.recommendationIds.length>=10){toast('立刻推荐 Top 10 已满，请先移除一款');return;}
      if(old)Object.assign(old,result);else state.data.games.push(result);
      setRankPosition(state.data.favoriteIds,result.id,wantFav,val('favPos'));
      setRankPosition(state.data.recommendationIds,result.id,wantRec,val('recPos'));
      if(val('recommendationNote'))state.data.recommendationNotes[result.id]=val('recommendationNote');
      else delete state.data.recommendationNotes[result.id];
      closeDialog($('#game-dialog'));persist();toast('已保存，导出 JSON 才能同步 GitHub');
    });
  }
  function exportJson(){
    const payload=JSON.stringify(state.data,null,2)+'\n';
    const a=document.createElement('a');const blob=new Blob([payload],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);a.href=url;a.download='games.json';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出 games.json · 上传到仓库 data/ 目录即可');
  }
  async function importJson(file){if(!file)return;
    try{
      if(file.size>4*1024*1024)throw new Error('文件太大（超过 4 MB）');
      const imported=normalizeData(JSON.parse(await file.text()));
      if(!confirm(`将导入 ${imported.games.length} 款游戏并替换此浏览器里的清单。确定继续？`))return;
      state.data=imported;persist();toast('导入成功');
    }catch(e){alert(`导入失败：${e.message}`);}
  }
  function bindEvents(){
    $$('.rank-tab').forEach(b=>b.addEventListener('click',()=>{state.rank=b.dataset.rank;renderRanks();}));
    $('#search-input').addEventListener('input',e=>{state.query=e.target.value;renderLibrary();});
    $('#genre-select').addEventListener('change',e=>{state.genre=e.target.value;renderLibrary();});
    $('#status-select').addEventListener('change',e=>{state.status=e.target.value;renderLibrary();});
    $('#sort-select').addEventListener('change',e=>{state.sort=e.target.value;renderLibrary();});
    $$('.filter-chip').forEach(b=>b.addEventListener('click',()=>{state.quick=b.dataset.filter;renderLibrary();}));
    $('#clear-filters').addEventListener('click',()=>{state.quick='all';state.query='';state.genre='全部';state.status='全部';$('#search-input').value='';$('#genre-select').value='全部';$('#status-select').value='全部';renderLibrary();});
    $('#edit-toggle').addEventListener('click',()=>showDialog($('#manager-dialog')));
    $('#manager-close').addEventListener('click',()=>closeDialog($('#manager-dialog')));
    $('#dialog-close').addEventListener('click',()=>closeDialog($('#game-dialog')));
    [$('#manager-dialog'),$('#game-dialog')].forEach(d=>{
      d.addEventListener('click',e=>{if(e.target===d)closeDialog(d);});
      d.addEventListener('close',()=>{document.body.classList.toggle('dialog-open', $('#manager-dialog').open||$('#game-dialog').open);});
    });
    $('#edit-mode-check').addEventListener('change',e=>{state.editMode=e.target.checked;toast(state.editMode?'已开启管理模式':'已退出管理模式');});
    $('#new-game').addEventListener('click',()=>{closeDialog($('#manager-dialog'));openEditor(null);});
    $('#export-json').addEventListener('click',exportJson);
    $('#import-json').addEventListener('click',()=>$('#import-input').click());
    $('#import-input').addEventListener('change',e=>{importJson(e.target.files[0]);e.target.value='';});
    $('#reset-local').addEventListener('click',()=>{
      if(!confirm('清除当前浏览器的全部修改，恢复成 GitHub 仓库中的原始游戏清单？此操作无法撤销。'))return;
      localStorage.removeItem(STORAGE_KEY);state.data=deepCopy(state.original);render();toast('已恢复仓库数据');$('#save-status').textContent='已恢复仓库数据';
    });
    document.addEventListener('keydown',e=>{if(e.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !$('#manager-dialog').open && !$('#game-dialog').open){e.preventDefault();$('#search-input').focus();}});
  }
  async function init(){
    bindEvents();
    try{
      const embedded=$('#game-archive-data');
      let raw;
      if (embedded) raw=JSON.parse(embedded.textContent);
      else { const response=await fetch(SOURCE,{cache:'no-cache'}); if(!response.ok)throw new Error(`HTTP ${response.status}`); raw=await response.json(); }
      const original=normalizeData(raw);state.original=original;state.data=deepCopy(original);
      try{const stored=localStorage.getItem(STORAGE_KEY);if(stored){state.data=normalizeData(JSON.parse(stored));$('#save-status').textContent='已读取浏览器本地修改';}}catch(e){console.warn('Cannot load local data',e);}
      render();
    }catch(err){
      console.error('Failed to load the game library',err);
      $('#result-count').textContent='游戏数据未加载';
      $('#games-grid').innerHTML='<div style="grid-column:1/-1;padding:30px;border:1px solid #855e55;border-radius:6px;color:#f3b8a2">无法加载 data/games.json。请确认文件存在；如果是在本地预览，请进入项目目录运行 <code>python -m http.server 8000</code>，再访问 http://localhost:8000 。</div>';
    }
  }
  init();
})();
