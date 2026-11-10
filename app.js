'use strict';

const regions = ['港岛', '九龙', '新界'];
const petKinds = {dog: ['狗狗', '🐶'], cat: ['猫咪', '🐱'], other: ['其他宠物', '🐾']};
const topics = {daily: '晒宠日常', help: '养宠互助', walk: '遛宠路线'};
const types = {
  weight: {label: '体重', icon: 'scale', color: 'peach'},
  vaccine: {label: '疫苗', icon: 'shield', color: 'sage'},
  care: {label: '驱虫', icon: 'leaf', color: 'lilac'},
  visit: {label: '就诊', icon: 'cross', color: 'sky'},
  moment: {label: '日常', icon: 'heart', color: 'rose'},
};
const walks = {
  港岛: {title: '海边慢慢走', detail: '找一段开阔的海边步道，给毛孩子留一点闻风的时间。', scene: 'shore'},
  九龙: {title: '找一块有树荫的草地', detail: '挑个凉快的时段，带上水和牵引绳，找一处可以休息的地方。', scene: 'park'},
  新界: {title: '换一条没走过的小路', detail: '选一条安静、好折返的路线，跟着毛孩子的步子走。', scene: 'hill'},
};
const legacyKey = 'pawprint.demo.v1';
const cloud = window.pawCloud;
const providerNames = {github: 'GitHub', google: 'Google'};

const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const navigation = document.querySelector('.sidebar nav');
const accountSlot = document.querySelector('#account-slot');
const returnRouteKey = 'pawprint.auth-return';
const drafts = new Map();
let signInPending = false;
let signInError = '';
let timelineFilter = 'all';
let topicFilter = 'all';
let toastTimer;
let focusAfterClose;
let user = null;
let account = null;
let loadingAccount = true;
let accountError = '';
let feedError = '';
let loadingFeed = false;
let morePosts = false;
let requestNumber = 0;
let replyRequestNumber = 0;
let sessionNumber = 0;
let saving = false;
const emptyState = () => ({records: [], posts: [], likes: [], savedWalks: [], pets: [], activePet: null, region: null});
let state = emptyState();
let legacy = null;
try {
  legacy = JSON.parse(localStorage.getItem(legacyKey));
} catch {
  // Private cloud records do not depend on local storage.
}

function localPetImport() {
  if (!legacy || !Array.isArray(legacy.records)) return {pets: [], records: []};
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const pets = (Array.isArray(legacy.pets) ? legacy.pets : []).filter(pet =>
    uuid.test(pet.id) && Object.hasOwn(petKinds, pet.kind) && typeof pet.name === 'string');
  const ids = new Set(pets.map(pet => pet.id));
  const records = legacy.records.filter(record => uuid.test(record.id) && Object.hasOwn(types, record.type)
    && (ids.has(record.petId) || !record.petId || record.petId === 'demo'));
  if (records.some(record => !record.petId || record.petId === 'demo')) {
    pets.push({id: user.id, name: '布丁', kind: 'dog', breed: '威尔士柯基犬'});
  }
  return {
    pets: pets.map(({id, name, kind, breed}) => ({id, name, kind, breed: breed || ''})),
    records: records.map(record => ({
      id: record.id, pet_id: ids.has(record.petId) ? record.petId : user.id,
      type: record.type, value: record.type === 'weight' ? String(Number(record.value)) : record.value,
      note: record.note || '', record_date: record.date, next_date: record.nextDate || null,
    })),
  };
}

function importPending() {
  if (!user) return false;
  const local = localPetImport();
  return local.pets.some(pet => !state.pets.some(item => item.id === pet.id))
    || local.records.some(record => !state.records.some(item => item.id === record.id));
}

function readRecord(record) {
  return {id: record.id, petId: record.pet_id, type: record.type, value: record.value,
    note: record.note, date: record.record_date, nextDate: record.next_date};
}

async function loadPrivate(expected) {
  const [pets, records] = await Promise.all([cloud.pets(), cloud.records()]);
  if (expected !== sessionNumber) return;
  state.pets = pets;
  state.records = records.map(readRecord);
  if (!pets.some(pet => pet.id === state.activePet)) state.activePet = pets[0]?.id ?? null;
}

function readPost(post) {
  return {
    ...post,
    author: post.display_name,
    text: post.body,
    date: today(new Date(post.created_at)),
    likes: post.paw_likes[0]?.count ?? 0,
    replies: post.paw_comments[0]?.count ?? 0,
  };
}

async function loadFeed({append = false, quiet = false} = {}) {
  if (!account) return;
  const request = ++requestNumber;
  const cursor = append ? state.posts.at(-1) : null;
  loadingFeed = true;
  let needsRender = !quiet;
  if (!quiet) {
    feedError = '';
    render();
  }
  try {
    const result = await cloud.posts(state.region, topicFilter, cursor, user.id);
    if (request !== requestNumber) return;
    const posts = result.posts.map(readPost);
    const previous = append ? state.posts : [];
    const likes = append ? [...state.likes, ...result.likes] : result.likes;
    const changed = JSON.stringify([previous.concat(posts), likes]) !== JSON.stringify([state.posts, state.likes]);
    state.posts = previous.concat(posts);
    state.likes = likes;
    morePosts = result.posts.length === 30;
    const recovered = Boolean(feedError);
    feedError = '';
    needsRender ||= changed || recovered;
  } catch {
    if (request !== requestNumber) return;
    feedError = '社区暂时无法更新，请稍后重试。';
    needsRender = true;
  } finally {
    if (request === requestNumber) {
      loadingFeed = false;
      if (needsRender) render();
    }
  }
}

async function loadAccount(session) {
  const expected = ++sessionNumber;
  ++requestNumber;
  if ((user?.id ?? null) !== (session?.user.id ?? null)) drafts.clear();
  user = session?.user ?? null;
  account = null;
  accountError = '';
  feedError = '';
  state = emptyState();
  morePosts = false;
  loadingFeed = false;
  loadingAccount = Boolean(user);
  if (dialog.open) dialog.close();
  render();
  try {
    if (!user) return;
    const profile = await cloud.profile();
    if (expected !== sessionNumber || !profile) return;
    account = profile;
    state.region = profile.region;
    state.savedWalks = profile.saved_walks;
    await loadPrivate(expected);
  } catch {
    if (expected === sessionNumber) accountError = '暂时无法读取云端资料，请重试。';
  } finally {
    if (expected === sessionNumber) {
      loadingAccount = false;
      render();
      if (account && !accountError && location.hash === '#community') void loadFeed();
    }
  }
}

async function startSession() {
  try {
    const session = await cloud.getSession();
    if (cloud.authReturn?.callback || cloud.authReturn?.failed) {
      restoreAuthRoute();
      if (!session) signInError = 'GitHub 授权未完成，请重新登录。';
    }
    await loadAccount(session);
  } catch {
    loadingAccount = false;
    accountError = '暂时无法连接登录服务，请重试。';
    render();
  }
}

function restoreAuthRoute() {
  const url = new URL(location.href);
  let route;
  try {
    route = sessionStorage.getItem(returnRouteKey);
    sessionStorage.removeItem(returnRouteKey);
  } catch {
    // Returning to the default page is safe if tab storage is unavailable.
  }
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = Object.hasOwn(pages, route) ? route : '';
  history.replaceState(history.state, '', url);
}

async function signIn(provider) {
  if (signInPending) return;
  signInPending = true;
  signInError = '';
  render();
  try {
    const route = location.hash.slice(1);
    try { sessionStorage.setItem(returnRouteKey, route); } catch { /* default route */ }
    const destination = await cloud.signIn(provider);
    if (!destination) throw new Error('Missing OAuth destination');
    location.assign(destination);
  } catch {
    signInPending = false;
    signInError = '暂时无法打开 GitHub 登录，请检查网络后重试。';
    render();
    main.querySelector('[data-action="sign-in"]')?.focus();
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function today(date = new Date()) {
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateLabel(date) {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function activePet() {
  return state.pets.find(pet => pet.id === state.activePet);
}

function petPicker() {
  const selected = activePet();
  const options = state.pets.map(pet => `<option value="${pet.id}"${pet.id === selected?.id ? ' selected' : ''}>${escapeHtml(pet.name)}</option>`).join('');
  return `<section class="pet-picker">${selected ? `<label>当前宠物<select id="active-pet">${options}</select></label>` : ''}<button class="button outline" data-action="add-pet">${icon('plus')}添加宠物</button>${selected ? '<button class="button quiet" data-action="edit-pet">编辑档案</button>' : ''}</section>`;
}

function records() {
  return state.records.filter(record => record.petId === state.activePet);
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
  return `<article class="entry"><span class="tile-icon ${type.color}">${icon(type.icon)}</span><div class="entry-text"><span class="entry-meta">${type.label} · ${dateLabel(record.date)}</span><h3>${escapeHtml(recordTitle(record))}</h3>${record.note ? `<p>${escapeHtml(record.note)}</p>` : ''}</div>${canShare ? `<button class="button quiet share" data-action="share" data-id="${record.id}" aria-label="分享${type.label}记录">${icon('share')}<span>分享</span></button>` : ''}</article>`;
}

function periodEnding(end, days) {
  const start = new Date(end + 'T12:00:00');
  start.setDate(start.getDate() - (days - 1));
  return today(start);
}

function recapData(days) {
  const end = today();
  const start = periodEnding(end, days);
  const items = records().filter(record => record.date >= start && record.date <= end);
  return {
    start, end, total: items.length, dates: new Set(items.map(record => record.date)).size,
    moments: items.filter(record => record.type === 'moment').length,
  };
}

function recapTile() {
  const data = recapData(7);
  return `<section class="recap-tile">
    <div class="recap-copy">
      <p class="eyebrow">${icon('spark')} GROWTH RECAP</p>
      <h2>${escapeHtml(activePet().name)}的成长回顾</h2>
      <p>最近 7 天 · ${data.total} 笔记录</p>
      <button class="button recap-button" data-action="recap">查看回顾卡${icon('arrow')}</button>
    </div>
    <span class="recap-stamp" aria-hidden="true">${icon('paw')}</span>
  </section>`;
}

function openRecap(trigger) {
  openDialog(`${escapeHtml(activePet().name)}的成长回顾`, `
    <input name="mode" type="hidden" value="recap">
    <label class="recap-period">回顾范围<select name="days"><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label>
    <canvas class="recap-preview" width="720" height="830" role="img"></canvas>
    <p class="muted" id="recap-source" role="status"></p>
  `, '下载图片', trigger, true);
  updateRecap();
}

function updateRecap() {
  const canvas = dialog.querySelector('canvas');
  if (!canvas) return;
  const days = Number(dialog.querySelector('[name="days"]').value);
  const data = recapData(days);
  const context = canvas.getContext('2d');
  const period = `${data.start.replaceAll('-', '.')} — ${data.end.replaceAll('-', '.')}`;
  const pet = activePet();
  canvas.setAttribute('aria-label', `${pet.name}的成长回顾。最近 ${days} 天，${data.total} 笔记录、${data.dates} 天有记录、${data.moments} 个日常。日期 ${period}`);
  dialog.querySelector('#recap-source').textContent = '下载的回顾卡含宠物名字、日期和记录次数。';
  if (!context) return;

  const ink = '#231f37';
  const lavender = '#d9d0fb';
  const cream = '#fff7e3';
  const yellow = '#f6d488';
  const font = (content, x, y, size, color, weight = 700) => {
    context.font = `${weight} ${size}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.fillStyle = color;
    context.fillText(content, x, y);
  };
  context.fillStyle = ink;
  context.fillRect(0, 0, 720, 830);
  context.strokeStyle = '#534873';
  context.lineWidth = 2;
  for (const radius of [188, 214, 240]) {
    context.beginPath();
    context.ellipse(534, 297, radius, radius * 0.79, -0.42, 0, 2 * Math.PI);
    context.stroke();
  }
  font('PAWPRINT JOURNAL  /  成长回顾', 48, 64, 24, yellow);
  context.save();
  context.beginPath();
  context.rect(42, 75, 630, 105);
  context.clip();
  context.font = '800 70px -apple-system, "PingFang SC", sans-serif';
  context.fillStyle = cream;
  context.fillText(`${pet.name}的`, 46, 161, 625);
  context.restore();
  font('成长回顾', 46, 247, 82, lavender, 800);
  font(`最近 ${days} 天`, 49, 303, 25, yellow);
  font(period, 49, 342, 20, cream, 500);
  font(petKinds[pet.kind][1], 475, 500, 133, cream);
  const stats = [[data.total, '笔记录'], [data.dates, '天有记录'], [data.moments, '个日常']];
  stats.forEach(([value, label], index) => {
    const x = 48 + index * 210;
    context.fillStyle = index === 0 ? yellow : lavender;
    context.beginPath();
    context.roundRect(x, 568, 204, 155, 22);
    context.fill();
    font(String(value), x + 20, 639, 48, ink, 800);
    font(label, x + 20, 684, 23, ink);
  });
  font('小小一笔，留住一起生活的日子。', 49, 786, 25, cream, 500);
  const download = dialog.querySelector('#recap-download');
  try {
    const url = canvas.toDataURL('image/png');
    if (url === 'data:,') throw new Error('Canvas unavailable');
    download.download = `pawprint-${days}d-${today()}.png`;
    download.href = url;
    download.hidden = false;
  } catch {
    download.hidden = true;
    dialog.querySelector('#recap-source').textContent = '此浏览器暂时无法导出图片。';
  }
}

function carePlan(all) {
  const seen = new Set();
  const plans = all.filter(record => {
    if (!['vaccine', 'care', 'visit'].includes(record.type)) return false;
    const key = `${record.type}:${record.value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(record.nextDate);
  }).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return `<section class="section"><div class="section-title"><h2>护理待办</h2><span class="muted">根据记录里的下次日期</span></div>
    <div class="card entries">${plans.length ? plans.map(record => {
      const due = record.nextDate <= today();
      return `<article class="entry"><span class="tile-icon ${due ? 'rose' : 'sage'}">${icon('clock')}</span><div class="entry-text"><span class="entry-meta">${dateLabel(record.nextDate)} · ${due ? '已到期' : '待办'}</span><h3>${escapeHtml(record.value)}</h3></div><button class="button outline" data-action="complete-plan" data-id="${record.id}">记完成</button></article>`;
    }).join('') : '<p class="empty">在疫苗、驱虫或就诊记录里填写「下次日期」，这里就会显示待办。</p>'}</div></section>`;
}

function profile() {
  const pet = activePet();
  if (!pet) return `${header('MY PET · 01', '宠物档案', '给家里的伙伴建一份成长档案。')}
    <div class="card empty-panel"><h2>添加第一只宠物</h2><p>称重、护理待办和日常都会归到它的档案。</p>${button('添加宠物', 'add-pet')}</div>`;
  const all = records();
  const stats = Object.entries(types).filter(([key]) => key !== 'moment').map(([key, type]) => {
    const last = all.find(record => record.type === key);
    const value = last ? (key === 'weight' ? `${Number(last.value)} <small>kg</small>` : escapeHtml(last.value)) : '待记录';
    return `<article class="card stat"><span class="tile-icon ${type.color}">${icon(type.icon)}</span><span class="stat-label">最近${type.label}</span><strong>${value}</strong><span class="stat-date">${last ? dateLabel(last.date) : '暂无记录'}</span></article>`;
  }).join('');
  return `${header('MY PET · 01', '宠物档案', '记录毛孩子的健康变化和每一个成长瞬间。')}
    ${petPicker()}
    <div class="profile-feature">
      <section class="hero" aria-label="${escapeHtml(pet.name)}的宠物档案">
        <div class="hero-copy">
          <span class="pill hero-label">${icon('paw')} 我的宠物</span>
          <h2>${escapeHtml(pet.name)}<span>MY PET</span></h2>
          <p>${escapeHtml(pet.breed || petKinds[pet.kind][0])}</p>
          <div class="hero-actions">${button('记一笔', 'record')}<button class="button hero-secondary" data-action="moment">${icon('heart')}记日常</button></div>
        </div>
        <span class="pet-avatar" aria-hidden="true">${petKinds[pet.kind][1]}</span>
      </section>
      ${recapTile()}
    </div>
    <section class="section"><div class="section-title"><h2>健康概览</h2><span class="muted">最近一次记录</span></div><div class="stats">${stats}</div></section>
    ${carePlan(all)}
    <section class="section"><div class="section-title"><h2>最近记录</h2><a class="text-link" href="#timeline">查看时间线${icon('arrow')}</a></div><div class="card entries">${all.length ? all.slice(0, 3).map(record => entry(record)).join('') : '<p class="empty">给这位新伙伴记下第一笔吧。</p>'}</div></section>`;
}

function chart(weights) {
  if (!weights.length) return '<div class="card chart"><h2>体重趋势</h2><p class="empty">记录第一次称重后，这里会显示体重。</p></div>';
  if (weights.length === 1) return `<div class="card chart"><div class="section-title"><h2>体重趋势</h2><strong>${recordTitle(weights[0])}</strong></div><p class="empty">已有 1 次称重。记满两次后即可查看趋势。</p></div>`;
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
  if (!activePet()) return `${header('GROWTH JOURNAL · 02', '成长时间线', '记录会按宠物和日期整理。')}
    <div class="card empty-panel"><h2>先添加一只宠物</h2>${button('添加宠物', 'add-pet')}</div>`;
  const all = records();
  const filtered = timelineFilter === 'all' ? all : all.filter(record => record.type === timelineFilter);
  const filters = [['all', '全部'], ...Object.entries(types).map(([key, type]) => [key, type.label])];
  return `${header('GROWTH JOURNAL · 02', '成长时间线', '从一次称重到每次接种，按日期回看成长。', button('记一笔', 'record'))}
    ${petPicker()}
    <div class="timeline-feature">${chart(all.filter(record => record.type === 'weight'))}${recapTile()}</div>
    <section class="section"><div class="section-title"><h2>成长记录</h2><span class="muted">${filtered.length} 条</span></div><div class="chips" aria-label="记录类型">${filters.map(([key, label]) => `<button class="chip" data-filter="${key}" aria-pressed="${timelineFilter === key}">${label}</button>`).join('')}</div><div class="card entries">${filtered.length ? filtered.map(record => entry(record, true)).join('') : '<p class="empty">这里还没有记录。可以从「记一笔」开始。</p>'}</div></section>`;
}

function postCard(post) {
  const liked = state.likes.includes(post.id);
  const author = post.author_id === user.id ? `${post.author}（我）` : post.author;
  return `<article class="card post">
    <div class="post-head"><span class="avatar peach">${escapeHtml(Array.from(post.author)[0])}</span><div><h3>${escapeHtml(author)}</h3><p>${post.region} · ${dateLabel(post.date)}</p></div><span class="post-topic">${topics[post.topic]}</span></div>
    <p class="post-body">${escapeHtml(post.text)}</p>
    <div class="post-actions"><button class="button quiet like" data-action="like" data-id="${post.id}" aria-label="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">${icon('heart')}${post.likes}</button><button class="button quiet" data-action="reply" data-id="${post.id}">${icon('chat')}评论 ${post.replies}</button></div>
  </article>`;
}

function walkCard() {
  const walk = walks[state.region];
  const saved = state.savedWalks.includes(state.region);
  return `<section class="walk-card ${walk.scene}" aria-label="散步灵感">
    <div class="walk-copy">
      <p class="eyebrow">${icon('pin')} ${state.region} · 散步灵感</p>
      <h2>${walk.title}</h2><p>${walk.detail}</p>
      <div class="walk-actions">
        <button class="button walk-save" data-action="save-walk" aria-pressed="${saved}">${icon(saved ? 'check' : 'bookmark')}${saved ? '已收藏' : '收藏灵感'}</button>
        ${activePet() ? `<button class="button quiet" data-action="log-walk">${icon('plus')}记一次散步</button>` : ''}
      </div>
    </div>
    <svg class="walk-art" viewBox="0 0 180 120" aria-hidden="true"><path d="M-8 106C27 42 58 105 88 71c27-31 47-41 96-41v92H-8Z" fill="currentColor" opacity=".24"/><circle cx="128" cy="32" r="14" fill="#f6d593"/><path d="M-5 111c40-38 66 10 106-17 21-14 39-34 79-24" stroke="#fffdf4" stroke-width="3" stroke-dasharray="5 8" fill="none"/><path d="M39 77V50m0 14-11-9m11 6 11-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="39" cy="44" r="15" fill="currentColor" opacity=".38"/></svg>
  </section>`;
}

function community() {
  const filters = [['all', '全部'], ...Object.entries(topics)];
  const feed = state.posts;
  const status = feedError || (loadingFeed && !feed.length ? '正在读取动态…' : '');
  return `${header('PET NEIGHBOURS · 03', '同城社区', '和同区宠友交流日常、养宠经验与散步路线。', button('发动态', 'post'))}
    <section class="region-panel" aria-label="选择社区区域">
      <div class="region-copy"><span class="tile-icon sage">${icon('pin')}</span><div><h2>我的地区</h2><p>此处显示你选定地区的动态和评论。</p></div></div>
      <div class="chips" aria-label="社区区域">${regions.map(region => `<button class="chip" data-region="${region}" aria-pressed="${state.region === region}">${region}</button>`).join('')}</div>
    </section>
    <section class="section"><div class="section-title"><h2>${state.region}动态</h2><button class="button quiet" data-action="refresh-feed">${icon('clock')}刷新动态</button></div>
      <div class="chips" aria-label="动态话题">${filters.map(([key, title]) => `<button class="chip" data-topic="${key}" aria-pressed="${key === topicFilter}">${title}</button>`).join('')}</div>
      ${status ? `<p class="feed-status muted" role="status">${status}</p>` : ''}
      <div class="feed">${feed.length ? feed.map(postCard).join('') : (!status ? `<div class="card empty-panel"><h3>${topicFilter === 'all' ? '这里还没有动态' : '这个话题还没有动态'}</h3><p>分享一个日常，或向同区宠友问个问题。</p>${button('写第一条动态', 'post')}</div>` : '')}</div>
      ${morePosts ? '<button class="button outline more-posts" data-action="more-posts">加载更早的动态</button>' : ''}
    </section>
    ${walkCard()}`;
}

function accountPage() {
  const status = loadingAccount ? '正在连接账号…' : accountError;
  const localFile = location.protocol === 'file:';
  const fromCommunity = location.hash === '#community';
  const providers = cloud.providers.map(provider => `<button class="button primary" data-action="sign-in" data-provider="${provider}"${signInPending ? ' disabled' : ''}>${signInPending ? '正在前往 GitHub…' : `使用 ${providerNames[provider]} 登录`}</button>`).join('');
  return `<section class="hero login-panel" aria-labelledby="login-title">
    <div class="hero-copy">
      <span class="pill hero-label">${icon('paw')} PAWPRINT JOURNAL</span>
      <h1 id="login-title">${user && !status ? '设置个人资料' : fromCommunity ? '加入同城社区' : '记录每一步成长'}</h1>
      <p class="login-intro">${localFile ? '打开网页版登录并同步你的记录。' : (status || (user ? '设置昵称，选一个地区，就可以开始记录和交流。' : fromCommunity ? '和同区宠友聊日常、问问题，一起发现新的散步路线。' : '记录宠物的健康和日常，也认识附近的宠友。'))}</p>
      <div class="hero-actions">${localFile ? '<a class="button primary" href="https://lisayinyy.github.io/pawprint/">打开网页版</a>' : loadingAccount ? '' : accountError ? '<button class="button outline" data-action="retry-account">重试</button>' : user ? button('设置昵称和地区', 'account') : providers}</div>
      ${!user && !localFile && !status ? '<p class="login-hint">登录后可跨设备同步。社区只展示你设置的昵称。</p>' : ''}
      <p class="dialog-error login-error" role="alert">${signInError}</p>
    </div>
    <img src="./corgi.svg" width="500" height="340" alt="">
  </section>`;
}

const pages = {profile, timeline, community};
function render({focus = false} = {}) {
  const focused = document.activeElement;
  const previousControl = focused?.closest('button');
  const selector = previousControl && main.contains(previousControl)
    ? Array.from(previousControl.attributes).filter(attribute => attribute.name.startsWith('data-'))
      .map(attribute => `[${attribute.name}="${CSS.escape(attribute.value)}"]`).join('') : '';
  const key = location.hash.slice(1);
  const page = Object.hasOwn(pages, key) ? key : 'profile';
  main.innerHTML = account && !loadingAccount && !accountError ? pages[page]() : accountPage();
  navigation.hidden = !account || Boolean(accountError) || loadingAccount;
  document.querySelector('.shell').classList.toggle('has-navigation', !navigation.hidden);
  accountSlot.innerHTML = user
    ? `<div class="account-label">${escapeHtml(account?.display_name || '已登录')}</div>${account ? '<button class="button quiet" data-action="account">账号设置</button>' : ''}<button class="button quiet" data-action="sign-out">退出登录</button>`
    : '<span class="muted">成长档案与同区社区</span>';
  document.querySelectorAll('[data-page]').forEach(link => {
    if (link.dataset.page === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (focus) {
    window.scrollTo(0, 0);
    main.focus({preventScroll: true});
  } else if (selector && !dialog.open) {
    main.querySelector(selector)?.focus({preventScroll: true});
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  notice.textContent = message;
  notice.hidden = false;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 3600);
}

function fitDialog() {
  if (!dialog.open || !window.visualViewport) return;
  const viewport = window.visualViewport;
  dialog.style.setProperty('--visible-height', `${viewport.height}px`);
  dialog.style.setProperty('--keyboard-offset', `${Math.max(0, innerHeight - viewport.height - viewport.offsetTop)}px`);
}

window.visualViewport?.addEventListener('resize', fitDialog);
window.visualViewport?.addEventListener('scroll', fitDialog);

function openDialog(title, fields, submit, trigger, isDownload = false) {
  const focusSelector = trigger?.dataset.id && trigger.dataset.action
    ? `[data-action="${CSS.escape(trigger.dataset.action)}"][data-id="${CSS.escape(trigger.dataset.id)}"]` : null;
  focusAfterClose = () => {
    const target = trigger?.isConnected ? trigger : focusSelector && main.querySelector(focusSelector);
    target?.focus?.({preventScroll: true});
  };
  const primary = isDownload
    ? `<a id="recap-download" class="button primary" hidden>${icon('download')}${submit}</a>`
    : `<button class="button primary" type="submit">${submit}</button>`;
  dialog.innerHTML = `<form id="editor"><div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="button quiet close" type="button" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="dialog-content">${fields}<p id="dialog-error" class="dialog-error" role="alert"></p></div><div class="dialog-actions"><button class="button quiet" type="button" data-action="close">取消</button>${primary}</div></form>`;
  dialog.classList.toggle('composer', ['post', 'reply'].includes(dialog.querySelector('[name="mode"]').value));
  dialog.showModal();
  fitDialog();
}

function recordField(type) {
  if (type === 'weight') return '<label>体重（kg）<input name="value" type="number" min="0.01" max="250" step="0.01" placeholder="例如 9.1" required></label>';
  const label = type === 'moment' ? '日常标题' : `${types[type].label}项目`;
  const examples = {moment: '例如 第一次去海边', vaccine: '例如 年度联苗', care: '例如 体内驱虫', visit: '例如 年度体检'};
  const followUp = type === 'moment' ? '' : '<label>下次日期（选填）<input type="date" name="nextDate"></label>';
  return `<label>${label}<input name="value" maxlength="40" placeholder="${examples[type]}" required></label>${followUp}`;
}

function openRecord(trigger, selected = 'weight', title = '') {
  openDialog(`给${escapeHtml(activePet().name)}记一笔`, `<input name="mode" type="hidden" value="record"><div class="form-row"><label>记录类型<select name="type">${Object.entries(types).map(([key, type]) => `<option value="${key}"${key === selected ? ' selected' : ''}>${type.label}</option>`).join('')}</select></label><label>记录日期<input name="date" type="date" value="${today()}" max="${today()}" required></label></div><div id="record-field">${recordField(selected)}</div><label>备注（选填）<textarea name="note" rows="3" maxlength="160" placeholder="例如 就诊机构、护理安排或一个日常瞬间"></textarea></label>`, '保存记录', trigger);
  dialog.querySelector('[name="value"]').value = title;
}

function restoreDraft(key) {
  const form = dialog.querySelector('form');
  form.dataset.draftKey = key;
  const draft = drafts.get(key);
  if (draft?.id) form.dataset.id = draft.id;
  if (draft?.topic && form.elements.topic) form.elements.topic.value = draft.topic;
  if (draft) form.elements.text.value = draft.text;
  updateCounter(form);
}

function updateCounter(form) {
  const field = form.elements.text;
  const counter = form.querySelector('.character-count');
  if (field && counter) counter.textContent = `${field.value.length} / ${field.maxLength}`;
}

function saveDraft(form) {
  const key = form.dataset.draftKey;
  if (!key) return;
  const text = form.elements.text.value;
  if (!text.trim()) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, {text, topic: form.elements.topic?.value, id: form.dataset.id});
}

function openPost(trigger, record) {
  const draft = record ? `${activePet().name}的${types[record.type].label}记录：${recordTitle(record)}。` : '';
  const topic = record || topicFilter === 'all' ? 'daily' : topicFilter;
  openDialog(record ? '分享成长记录' : '发布动态', `
    <input name="mode" type="hidden" value="post">
    <p class="audience-note">${icon('pin')} 发布至 ${state.region}社区</p>
    <label>话题<select name="topic">${Object.entries(topics).map(([key, title]) => `<option value="${key}"${key === topic ? ' selected' : ''}>${title}</option>`).join('')}</select></label>
    <label>动态内容<textarea name="text" rows="4" maxlength="280" placeholder="想分享哪件养宠小事？" required>${escapeHtml(draft)}</textarea></label>
    <p class="composer-meta"><span>关闭后可在本页继续草稿</span><span class="character-count" aria-hidden="true"></span></p>`, '发布动态', trigger);
  restoreDraft(`post:${state.region}:${record?.id ?? ''}`);
}

function openPet(trigger, pet) {
  const options = Object.entries(petKinds).map(([key, [title]]) => `<option value="${key}"${key === pet?.kind ? ' selected' : ''}>${title}</option>`).join('');
  openDialog(pet ? '编辑宠物档案' : '添加宠物', `
    <input name="mode" type="hidden" value="pet"><input name="petId" type="hidden" value="${pet?.id ?? ''}">
    <label>宠物名字<input name="name" maxlength="16" required value="${escapeHtml(pet?.name ?? '')}"></label>
    <div class="form-row"><label>宠物类型<select name="kind">${options}</select></label><label>品种（选填）<input name="breed" maxlength="24" value="${escapeHtml(pet?.breed ?? '')}"></label></div>`, '保存档案', trigger);
}

function openAccount(trigger) {
  const options = regions.map(region => `<option${region === state.region ? ' selected' : ''}>${region}</option>`).join('');
  openDialog('昵称与地区', `
    <input name="mode" type="hidden" value="account">
    <label>社区昵称<input name="displayName" maxlength="24" autocomplete="nickname" required value="${escapeHtml(account?.display_name ?? '')}"></label>
    <label>我的地区<select name="region">${options}</select></label>
    <p class="muted">发帖和评论时会显示此昵称。地区决定你能浏览和参与的社区。</p>
    ${account && importPending() ? '<button class="button outline" type="button" data-action="import-local">导入此浏览器的旧档案</button>' : ''}`,
    '保存设置', trigger);
}

function openImport(trigger) {
  const local = localPetImport();
  const pets = local.pets.filter(pet => !state.pets.some(item => item.id === pet.id));
  const records = local.records.filter(record => !state.records.some(item => item.id === record.id));
  dialog.close();
  openDialog('导入旧档案', `
    <input name="mode" type="hidden" value="import">
    <p>将此浏览器的 ${pets.length} 份宠物档案和 ${records.length} 条记录复制到当前账号。档案仍为私人资料。</p>
    <p class="muted">旧社区动态和评论留在原浏览器数据中。</p>`,
    '导入档案', trigger);
}

function replyMarkup(replies) {
  if (!replies.length) return '<p class="muted">还没有评论。</p>';
  return `<ul class="reply-list">${replies.slice().reverse().map(reply => `<li><strong>${escapeHtml(reply.display_name)}${reply.author_id === user.id ? '（我）' : ''}</strong><p>${escapeHtml(reply.body)}</p></li>`).join('')}</ul>`;
}

async function openReplies(trigger, postId) {
  const post = state.posts.find(item => item.id === postId);
  if (!post) return;
  openDialog('动态评论', `<input name="mode" type="hidden" value="reply"><input name="postId" type="hidden" value="${postId}">
    <div class="reply-context"><strong>${escapeHtml(post.author)}</strong><p>${escapeHtml(post.text)}</p></div>
    <div id="replies" aria-live="polite"><p class="muted">正在读取评论…</p></div>
    <label>写评论<textarea name="text" maxlength="160" rows="2" required placeholder="和宠友说点什么…"></textarea></label>
    <p class="composer-meta"><span>关闭后可在本页继续草稿</span><span class="character-count" aria-hidden="true"></span></p>`, '发送评论', trigger);
  restoreDraft(`reply:${postId}`);
  await updateReplies(postId);
}

async function updateReplies(postId) {
  const target = dialog.querySelector('#replies');
  if (!target) return;
  const request = ++replyRequestNumber;
  try {
    const replies = await cloud.replies(postId);
    if (request !== replyRequestNumber || !target.isConnected || !dialog.open) return;
    const markup = replyMarkup(replies);
    if (target.innerHTML !== markup) target.innerHTML = markup;
  } catch {
    if (request === replyRequestNumber && target.isConnected && dialog.open) target.innerHTML = '<p class="muted">暂时无法读取评论。</p><button type="button" class="button outline" data-action="retry-replies">重试加载</button>';
  }
}

async function refreshRegion(region, expected) {
  const profile = await cloud.saveProfile(user.id, {region}, false);
  if (expected !== sessionNumber) return;
  account = profile;
  state.region = profile.region;
  state.posts = [];
  state.likes = [];
  morePosts = false;
  void loadFeed();
}

async function write(action, button) {
  if (saving) {
    toast('正在保存，请稍等。');
    return;
  }
  saving = true;
  const expected = sessionNumber;
  const errorMessage = dialog.querySelector('#dialog-error');
  const form = button?.type === 'submit' ? button.form : null;
  const previousLabel = button?.textContent;
  const draftField = form?.elements.text;
  const closeButtons = form?.querySelectorAll('[data-action="close"]');
  if (button) button.disabled = true;
  if (form) {
    form.dataset.pending = 'true';
    closeButtons.forEach(control => { control.disabled = true; });
    if (draftField) draftField.readOnly = true;
    button.textContent = {post: '正在发布…', reply: '正在发送…'}[form.elements.mode.value] ?? '正在保存…';
  }
  if (errorMessage) errorMessage.textContent = '';
  try {
    await action(expected);
  } catch (error) {
    if (expected !== sessionNumber) return;
    if (error.code === 'EARLIER_DRAFT_SENT' && form) {
      delete form.dataset.id;
      saveDraft(form);
      errorMessage.textContent = '上一版文字已发送。这次修改仍在草稿里，请确认后再发。';
      return;
    }
    const message = draftField
      ? '这次发送未确认，文字已保留。请检查连接后重试。'
      : '暂时无法完成操作，请检查连接后重试。';
    if (dialog.open && errorMessage?.isConnected) errorMessage.textContent = message;
    else toast(message);
  } finally {
    saving = false;
    if (button?.isConnected) {
      button.disabled = false;
      if (form) button.textContent = previousLabel;
    }
    if (form) {
      delete form.dataset.pending;
      closeButtons.forEach(control => { control.disabled = false; });
    }
    if (draftField) draftField.readOnly = false;
  }
}

main.addEventListener('change', event => {
  if (event.target.id !== 'active-pet') return;
  state.activePet = event.target.value;
  timelineFilter = 'all';
  render();
  main.querySelector('#active-pet').focus();
});

document.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control) return;
  const {action, filter, region, id, topic, provider} = control.dataset;
  if (action === 'retry-account') {
    loadingAccount = true;
    render();
    void startSession();
  }
  if (action === 'sign-in') void signIn(provider);
  if (action === 'sign-out') void write(async () => {
    await cloud.signOut();
    if (user) await loadAccount(null);
  }, control);
  if (action === 'account') openAccount(control);
  if (action === 'import-local') openImport(control);
  if (!account) return;

  if (topic && topicFilter !== topic) {
    topicFilter = topic;
    state.posts = [];
    state.likes = [];
    morePosts = false;
    void loadFeed();
  }
  if (filter) {
    timelineFilter = filter;
    render();
    main.querySelector(`[data-filter="${filter}"]`).focus();
  }
  if (region && state.region !== region) void write(expected => refreshRegion(region, expected), control);
  if (action === 'refresh-feed') void loadFeed();
  if (action === 'more-posts' && !loadingFeed) void loadFeed({append: true});
  if (action === 'record') openRecord(control);
  if (action === 'add-pet') openPet(control);
  if (action === 'edit-pet') openPet(control, activePet());
  if (action === 'complete-plan') {
    const record = records().find(record => record.id === id);
    openRecord(control, record.type, record.value);
  }
  if (action === 'moment') openRecord(control, 'moment');
  if (action === 'log-walk') openRecord(control, 'moment', walks[state.region].title);
  if (action === 'recap') openRecap(control);
  if (action === 'save-walk') void write(async expected => {
    const region = state.region;
    const saved = state.savedWalks.includes(region);
    const updated = saved ? state.savedWalks.filter(item => item !== region) : [...state.savedWalks, region];
    const profile = await cloud.saveProfile(user.id, {saved_walks: updated}, false);
    if (expected !== sessionNumber) return;
    account = profile;
    state.savedWalks = profile.saved_walks;
    render();
    main.querySelector('[data-action="save-walk"]')?.focus();
    toast(saved ? '已取消收藏' : '已收藏散步灵感');
  }, control);
  if (action === 'post') openPost(control);
  if (action === 'share') openPost(control, records().find(record => record.id === id));
  if (action === 'reply') void openReplies(control, id);
  if (action === 'retry-replies') void updateReplies(dialog.querySelector('[name="postId"]').value);
  if (action === 'like') void write(async expected => {
    if (state.likes.includes(id)) await cloud.removeLike(id, user.id);
    else await cloud.addLike(id);
    if (expected === sessionNumber) void loadFeed();
  }, control);
});

dialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="close"]') && !dialog.querySelector('form[data-pending]')) dialog.close();
});
dialog.addEventListener('cancel', event => {
  if (dialog.querySelector('form[data-pending]')) event.preventDefault();
});
dialog.addEventListener('change', event => {
  if (event.target.name === 'topic') saveDraft(event.target.form);
  if (event.target.name === 'type') dialog.querySelector('#record-field').innerHTML = recordField(event.target.value);
  if (event.target.name === 'days') updateRecap();
});
dialog.addEventListener('input', event => {
  event.target.setCustomValidity?.('');
  if (event.target.name === 'text') {
    updateCounter(event.target.form);
    saveDraft(event.target.form);
  }
  if (event.target.name === 'date') dialog.querySelector('[name="nextDate"]')?.setCustomValidity('');
});
dialog.addEventListener('close', () => {
  focusAfterClose?.();
});

function toPage(destination) {
  if (location.hash !== destination) location.hash = destination;
  else render({focus: true});
}

async function handleSubmit(form, expected) {
  const values = Object.fromEntries(new FormData(form));
  const id = form.dataset.id ||= crypto.randomUUID();
  saveDraft(form);
  if (values.mode === 'account') {
    const creating = !account;
    const profile = await cloud.saveProfile(user.id, {display_name: values.displayName.trim(), region: values.region}, creating);
    if (expected !== sessionNumber) return;
    account = profile;
    state.region = profile.region;
    state.savedWalks = profile.saved_walks;
    state.posts = [];
    state.likes = [];
    morePosts = false;
    if (creating) await loadPrivate(expected);
    if (expected !== sessionNumber) return;
    dialog.close();
    render();
    if (location.hash === '#community') void loadFeed();
    toast('账号设置已保存');
    return;
  }
  if (values.mode === 'import') {
    const local = localPetImport();
    if (local.pets.length) await cloud.importPets(local.pets);
    if (expected !== sessionNumber) return;
    if (local.records.length) await cloud.importRecords(local.records);
    await loadPrivate(expected);
    if (expected !== sessionNumber) return;
    dialog.close();
    render();
    toast(importPending() ? '部分记录未能导入，请检查当前账号。' : '旧档案已导入');
    return;
  }
  if (values.mode === 'pet') {
    const pet = await cloud.savePet({id: values.petId || id, name: values.name.trim(), kind: values.kind, breed: values.breed.trim()});
    if (expected !== sessionNumber) return;
    const existing = state.pets.some(item => item.id === pet.id);
    state.pets = existing ? state.pets.map(item => item.id === pet.id ? pet : item) : [...state.pets, pet];
    state.activePet = pet.id;
    timelineFilter = 'all';
    dialog.close();
    render();
    toast('宠物档案已同步');
    return;
  }
  if (values.mode === 'record') {
    await cloud.addRecord({
      id, pet_id: activePet().id, type: values.type, record_date: values.date,
      value: values.type === 'weight' ? String(Number(values.value)) : values.value.trim(),
      note: values.note.trim(), next_date: values.nextDate || null,
    });
    await loadPrivate(expected);
    if (expected !== sessionNumber) return;
    timelineFilter = 'all';
    dialog.close();
    toPage('#timeline');
    toast('记录已同步到成长时间线');
    return;
  }
  if (values.mode === 'reply') {
    await cloud.addReply({id, post_id: values.postId, display_name: account.display_name, body: values.text.trim()});
    if (expected !== sessionNumber) return;
    drafts.delete(form.dataset.draftKey);
    form.elements.text.value = '';
    delete form.dataset.id;
    updateCounter(form);
    await updateReplies(values.postId);
    if (expected !== sessionNumber) return;
    void loadFeed({quiet: true});
    toast('评论已发送');
    return;
  }
  await cloud.addPost({id, display_name: account.display_name, region: state.region, topic: values.topic, body: values.text.trim()});
  if (expected !== sessionNumber) return;
  drafts.delete(form.dataset.draftKey);
  topicFilter = values.topic;
  dialog.close();
  if (location.hash === '#community') void loadFeed();
  else toPage('#community');
  toast(`已发布到${state.region}动态`);
}

dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const mode = form.elements.mode.value;
  if (mode === 'recap' || !user) return;
  const required = form.elements[{record: 'value', pet: 'name', account: 'displayName', post: 'text', reply: 'text'}[mode]];
  if (required && !required.value.trim()) {
    required.setCustomValidity('请输入内容。');
    required.reportValidity();
    return;
  }
  if (form.elements.nextDate?.value && form.elements.nextDate.value < form.elements.date.value) {
    form.elements.nextDate.setCustomValidity('下次日期须在记录日期当日或之后。');
    form.elements.nextDate.reportValidity();
    return;
  }
  void write(expected => handleSubmit(form, expected), event.submitter);
});

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener('pageshow', event => {
  if (event.persisted && signInPending) {
    signInPending = false;
    render();
  }
});
window.addEventListener('hashchange', () => {
  render({focus: true});
  if (account && location.hash === '#community') void loadFeed();
});

if (cloud.ready) {
  cloud.onAuthChange((event, session) => {
    if (event === 'INITIAL_SESSION' || (session?.user.id ?? null) === (user?.id ?? null)) return;
    void loadAccount(session);
  });
  void startSession();
  setInterval(() => {
    if (!account || document.hidden || location.hash !== '#community' || loadingFeed || saving) return;
    if (dialog.open) {
      const postId = dialog.querySelector('[name="postId"]')?.value;
      if (postId) void updateReplies(postId);
      return;
    }
    if (state.posts.length <= 30) void loadFeed({quiet: true});
  }, 20000);
} else {
  loadingAccount = false;
  accountError = '暂时无法连接账号服务。';
  render();
}
