'use strict';

const regions = ['港岛', '九龙', '新界'];
const types = {
  weight: {label: '体重', icon: 'scale', color: 'peach'},
  vaccine: {label: '疫苗', icon: 'shield', color: 'sage'},
  care: {label: '驱虫', icon: 'leaf', color: 'lilac'},
};
const friends = [
  {name: '可乐爸', pet: '可乐 · 柴犬', region: '港岛', emoji: '🐕', color: 'peach', bio: '周末常去中西区海滨散步。'},
  {name: '栗子妈', pet: '栗子 · 英短', region: '港岛', emoji: '🐈', color: 'sage', bio: '在找适合室内猫的益智玩具。'},
  {name: '豆包姐姐', pet: '豆包 · 贵宾', region: '九龙', emoji: '🐩', color: 'lilac', bio: '偶尔在西九遛狗，欢迎交流梳毛心得。'},
  {name: '三花同学', pet: '三花 · 唐猫', region: '九龙', emoji: '🐱', color: 'peach', bio: '三花最喜欢坐窗边看鸟。'},
  {name: '糯米爸', pet: '糯米 · 金毛', region: '新界', emoji: '🦮', color: 'sage', bio: '喜欢带糯米在大埔散步。'},
  {name: 'Momo 妈', pet: 'Momo · 比熊', region: '新界', emoji: '🐶', color: 'lilac', bio: '正在练习出门前乖乖等牵引绳。'},
];
const seedRecords = [
  {id: 'seed-w1', type: 'weight', date: '2026-09-12', value: '8.2', note: ''},
  {id: 'seed-w2', type: 'weight', date: '2026-10-01', value: '8.4', note: ''},
  {id: 'seed-w3', type: 'weight', date: '2026-10-18', value: '8.7', note: ''},
  {id: 'seed-v1', type: 'vaccine', date: '2026-10-22', value: '年度联苗', note: '已完成本年度接种。'},
  {id: 'seed-c1', type: 'care', date: '2026-10-29', value: '体内外驱虫', note: '已记录本次驱虫。'},
  {id: 'seed-w4', type: 'weight', date: '2026-11-06', value: '8.9', note: '早饭前称重。'},
];
const seedPosts = [
  {id: 'seed-p1', author: '可乐爸', emoji: '🐕', color: 'peach', region: '港岛', date: '2026-11-08', text: '今天在海滨捡到一片比可乐耳朵还大的叶子。它一路叼回家，谁也不肯给。', likes: 4},
  {id: 'seed-p2', author: '豆包姐姐', emoji: '🐩', color: 'lilac', region: '九龙', date: '2026-11-07', text: '最近把梳毛拆成了两分钟一次，豆包终于愿意趴下等我梳完一边了。', likes: 3},
  {id: 'seed-p3', author: '糯米爸', emoji: '🦮', color: 'sage', region: '新界', date: '2026-11-06', text: '今天试了大埔的新路线。糯米闻得太认真，走了半小时还没走出第一条街。', likes: 6},
];
const storageKey = 'pawprint.demo.v1';
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
let timelineFilter = 'all';
let toastTimer;
let focusAfterClose;
let state = {records: [], posts: [], likes: [], region: '港岛'};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.records) && Array.isArray(saved.posts) && Array.isArray(saved.likes)) {
    state = {...saved, region: regions.includes(saved.region) ? saved.region : '港岛'};
  }
} catch {
  // The demo can still run for this visit when browser storage is unavailable.
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function today() {
  const date = new Date();
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateLabel(date) {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function records() {
  return [...state.records, ...seedRecords].sort((first, second) => second.date.localeCompare(first.date));
}

function recordTitle(record) {
  return record.type === 'weight' ? `${Number(record.value)} kg` : record.value;
}

function header(kicker, title, description, action = '') {
  return `<header class="page-header"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subtitle">${description}</p></div>${action}</header>`;
}

function button(label, action, symbol = 'plus') {
  return `<button class="button primary" data-action="${action}">${icon(symbol)}${label}</button>`;
}

function entry(record, canShare = false) {
  const type = types[record.type];
  return `<article class="entry"><span class="tile-icon ${type.color}">${icon(type.icon)}</span><div class="entry-text"><span class="entry-meta">${type.label} · ${dateLabel(record.date)}${record.id.startsWith('seed-') ? ' · 示例' : ''}</span><h3>${escapeHtml(recordTitle(record))}</h3>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ''}</div>${canShare ? `<button class="button quiet share" data-action="share" data-id="${record.id}" aria-label="分享${type.label}记录">${icon('share')}<span>分享</span></button>` : ''}</article>`;
}

function profile() {
  const all = records();
  const stats = Object.entries(types).map(([key, type]) => {
    const last = all.find(record => record.type === key);
    const value = key === 'weight' ? `${Number(last.value)} <small>kg</small>` : escapeHtml(last.value);
    return `<article class="card stat"><span class="tile-icon ${type.color}">${icon(type.icon)}</span><span class="stat-label">${key === 'weight' ? '最近体重' : `最近${type.label}`}</span><strong>${value}</strong><span class="stat-date">${dateLabel(last.date)}</span></article>`;
  }).join('');
  return `${header('MY PET · 01', '宠物档案', '记录毛孩子的健康变化和每一个成长瞬间。')}
    <section class="hero" aria-label="示例宠物布丁"><div class="hero-copy"><span class="pill hero-label">${icon('paw')} 示例宠物</span><h2>布丁<span> / PUDDING</span></h2><p>威尔士柯基犬 <span>·</span> 2 岁 <span>·</span> 男孩</p>${button('记一笔', 'record')}</div><img src="./corgi.svg" alt="戴着绿色项圈的柯基布丁"></section>
    <section class="section"><div class="section-title"><h2>健康概览</h2><span class="muted">最近一次记录</span></div><div class="stats">${stats}</div></section>
    <section class="section"><div class="section-title"><h2>最近记录</h2><a class="text-link" href="#timeline">查看时间线${icon('arrow')}</a></div><div class="card entries">${all.slice(0, 3).map(record => entry(record)).join('')}</div></section>`;
}

function chart(weights) {
  const displayed = weights.slice(0, 8).reverse();
  const values = displayed.map(record => Number(record.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scale = Math.max(max - min, 0.1);
  const points = displayed.map((record, index) => ({
    x: 34 + index * 492 / Math.max(1, displayed.length - 1),
    y: 115 - (Number(record.value) - min) / scale * 85,
    record,
  }));
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const area = `34,132 ${line} 526,132`;
  const dots = points.map(({x, y, record}) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#fff" stroke="#b75939" stroke-width="3"><title>${dateLabel(record.date)} · ${recordTitle(record)}</title></circle>`).join('');
  return `<div class="card chart"><div class="section-title"><div><h2>体重趋势</h2><p class="muted">最近 ${displayed.length} 次称重</p></div><strong>${recordTitle(weights[0])}</strong></div><svg class="weight-chart" viewBox="0 0 560 144" role="img" aria-label="体重折线图，最近 ${recordTitle(weights[0])}"><defs><linearGradient id="weight-fill" x2="0" y2="1"><stop stop-color="#f2b79a" stop-opacity=".6"/><stop offset="1" stop-color="#f2b79a" stop-opacity=".06"/></linearGradient></defs><path d="M34 30h492M34 64h492M34 98h492M34 132h492" stroke="#e9e2db" stroke-dasharray="4 5"/><polygon points="${area}" fill="url(#weight-fill)"/><polyline points="${line}" fill="none" stroke="#b75939" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg><div class="chart-dates"><span>${dateLabel(displayed[0].date)}</span><span>${dateLabel(displayed.at(-1).date)}</span></div></div>`;
}

function timeline() {
  const all = records();
  const filtered = timelineFilter === 'all' ? all : all.filter(record => record.type === timelineFilter);
  const filters = [['all', '全部'], ...Object.entries(types).map(([key, type]) => [key, type.label])];
  return `${header('GROWTH JOURNAL · 02', '成长时间线', '从一次称重到每次接种，按日期回看布丁的成长。', button('记一笔', 'record'))}
    ${chart(all.filter(record => record.type === 'weight'))}
    <section class="section"><div class="section-title"><h2>成长记录</h2><span class="muted">${filtered.length} 条</span></div><div class="chips" aria-label="记录类型">${filters.map(([key, label]) => `<button class="chip" data-filter="${key}" aria-pressed="${timelineFilter === key}">${label}</button>`).join('')}</div><div class="card entries">${filtered.map(record => entry(record, true)).join('')}</div></section>`;
}

function postCard(post) {
  const own = post.author === '我';
  const liked = state.likes.includes(post.id);
  return `<article class="card post"><div class="post-head"><span class="avatar ${post.color}" aria-hidden="true">${post.emoji}</span><div><h3>${post.author}</h3><p>${post.region} · ${dateLabel(post.date)}${own ? ' · 本机动态' : ' · 示例'}</p></div></div><p class="post-body">${escapeHtml(post.text)}</p><button class="button quiet like" data-action="like" data-id="${post.id}" aria-label="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">${icon('heart')}${post.likes + Number(liked)}</button></article>`;
}

function community() {
  const nearby = friends.filter(friend => friend.region === state.region);
  const feed = [...state.posts, ...seedPosts].filter(post => post.region === state.region);
  return `${header('PET NEIGHBOURS · 03', '同城社区', '看看同区宠友的日常，也分享你和布丁的新鲜事。', button('发动态', 'post'))}
    <section class="region-panel" aria-label="选择社区区域"><div class="region-copy"><span class="tile-icon sage">${icon('pin')}</span><div><h2>我的地区</h2><p>选择区域查看同区的示例宠友和动态</p></div></div><div class="chips" aria-label="社区区域">${regions.map(region => `<button class="chip" data-region="${region}" aria-pressed="${state.region === region}">${region}</button>`).join('')}</div></section>
    <section class="section"><div class="section-title"><h2>${state.region}宠友</h2><span class="muted">${nearby.length} 位示例宠友</span></div><div class="friend-grid">${nearby.map(friend => `<article class="card friend"><span class="avatar ${friend.color}" aria-hidden="true">${friend.emoji}</span><div><h3>${friend.name}</h3><p>${friend.pet}</p><p>${friend.bio}</p></div></article>`).join('')}</div></section>
    <section class="section"><div class="section-title"><h2>${state.region}动态</h2><span class="muted">${feed.length} 条</span></div><div class="feed">${feed.map(postCard).join('')}</div></section>`;
}

const pages = {profile, timeline, community};
function render({focus = false} = {}) {
  const key = location.hash.slice(1);
  const page = Object.hasOwn(pages, key) ? key : 'profile';
  main.innerHTML = pages[page]();
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (focus) {
    window.scrollTo(0, 0);
    main.focus({preventScroll: true});
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  notice.textContent = message;
  notice.hidden = false;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 3600);
}

function openDialog(title, fields, submit, trigger) {
  focusAfterClose = trigger;
  dialog.innerHTML = `<form id="editor"><div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="button quiet close" type="button" data-action="close" aria-label="关闭">${icon('close')}</button></div>${fields}<div class="dialog-actions"><button class="button quiet" type="button" data-action="close">取消</button><button class="button primary" type="submit">${submit}</button></div></form>`;
  dialog.showModal();
}

function recordField(type) {
  if (type === 'weight') return '<label>体重（kg）<input name="value" type="number" min="0.01" max="250" step="0.01" placeholder="例如 9.1" required></label>';
  return `<label>${types[type].label}项目<input name="value" maxlength="40" placeholder="${type === 'vaccine' ? '例如 年度联苗' : '例如 体内驱虫'}" required></label>`;
}

function openRecord(trigger) {
  openDialog('给布丁记一笔', `<input name="mode" type="hidden" value="record"><div class="form-row"><label>记录类型<select name="type">${Object.entries(types).map(([key, type]) => `<option value="${key}">${type.label}</option>`).join('')}</select></label><label>记录日期<input name="date" type="date" value="${today()}" max="${today()}" required></label></div><div id="record-field">${recordField('weight')}</div><label>备注（选填）<textarea name="note" rows="3" maxlength="160" placeholder="例如 早饭前称重"></textarea></label>`, '保存记录', trigger);
}

function openPost(trigger, record) {
  const draft = record ? `布丁的${types[record.type].label}记录：${recordTitle(record)}。` : '';
  openDialog(record ? '分享成长记录' : '发布养宠日常', `<input name="mode" type="hidden" value="post"><label>发布区域<select name="region">${regions.map(region => `<option${state.region === region ? ' selected' : ''}>${region}</option>`).join('')}</select></label><label>动态内容<textarea name="text" rows="4" maxlength="280" placeholder="今天和布丁发生了什么？" required>${escapeHtml(draft)}</textarea></label><p class="muted">内容仅在此浏览器的社区演示中显示。</p>`, '发布动态', trigger);
}

main.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control) return;
  const {action, filter, region, id} = control.dataset;
  if (filter) {
    timelineFilter = filter;
    render();
    main.querySelector(`[data-filter="${filter}"]`).focus();
  }
  if (region) {
    state.region = region;
    save();
    render();
    main.querySelector(`[data-region="${region}"]`).focus();
  }
  if (action === 'record') openRecord(control);
  if (action === 'post') openPost(control);
  if (action === 'share') openPost(control, records().find(record => record.id === id));
  if (action === 'like') {
    state.likes = state.likes.includes(id) ? state.likes.filter(like => like !== id) : [...state.likes, id];
    save();
    render();
    main.querySelector(`[data-id="${id}"]`).focus();
  }
});

dialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="close"]')) dialog.close();
});
dialog.addEventListener('change', event => {
  if (event.target.name === 'type') dialog.querySelector('#record-field').innerHTML = recordField(event.target.value);
});
dialog.addEventListener('input', event => { event.target.setCustomValidity?.(''); });
dialog.addEventListener('close', () => {
  if (focusAfterClose?.isConnected) focusAfterClose.focus();
});
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  const isRecord = values.mode === 'record';
  const required = form.elements[isRecord ? 'value' : 'text'];
  const content = required.value.trim();
  if (!content) {
    required.setCustomValidity('请输入内容。');
    required.reportValidity();
    return;
  }
  const id = crypto.randomUUID();
  if (isRecord) {
    state.records.unshift({id, type: values.type, date: values.date, value: content, note: values.note.trim()});
    timelineFilter = 'all';
  } else {
    state.region = values.region;
    state.posts.unshift({id, author: '我', emoji: '🐾', color: 'peach', region: values.region, date: today(), text: content, likes: 0});
  }
  const persisted = save();
  dialog.close();
  const destination = isRecord ? '#timeline' : '#community';
  if (location.hash !== destination) location.hash = destination;
  else render({focus: true});
  const message = isRecord ? '已添加到成长时间线' : `已发布到${values.region}动态`;
  toast(persisted ? message : `${message}，刷新后会清除`);
});
window.addEventListener('hashchange', () => render({focus: true}));
render();
