'use strict';

const regions = ['港岛', '九龙', '新界'];
const petKinds = {dog: ['狗狗', '🐶'], cat: ['猫咪', '🐱'], other: ['其他宠物', '🐾']};
const demoPet = {id: 'demo', name: '布丁', kind: 'dog', breed: '威尔士柯基犬'};
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
  {id: 'seed-c1', type: 'care', date: '2026-10-29', value: '体内外驱虫', note: '已记录本次驱虫。', nextDate: '2026-11-29'},
  {id: 'seed-w4', type: 'weight', date: '2026-11-06', value: '8.9', note: '早饭前称重。'},
  {id: 'seed-m1', type: 'moment', date: '2026-11-04', value: '把落叶带回家', note: '散步时捡到一片大叶子。'},
  {id: 'seed-m2', type: 'moment', date: '2026-11-08', value: '在窗边晒太阳', note: '趴了半个下午，耳朵都晒暖了。'},
];
const seedPosts = [
  {id: 'seed-p4', author: '栗子妈', emoji: '🐈', color: 'sage', region: '港岛', topic: 'help', date: '2026-11-08', text: '栗子很快就玩腻了逗猫棒。你们有没有试过用纸箱做猫咪玩具？', likes: 2},
  {id: 'seed-p5', author: '三花同学', emoji: '🐱', color: 'peach', region: '九龙', topic: 'help', date: '2026-11-07', text: '下周要带三花出门。你们平时怎么让猫熟悉航空箱？', likes: 5},
  {id: 'seed-p6', author: '可乐爸', emoji: '🐕', color: 'peach', region: '港岛', topic: 'walk', date: '2026-11-06', text: '带可乐走海边时，我会留一段时间让它自己挑方向。想收集一些比较安静、容易折返的路线。', likes: 3},
  {id: 'seed-p7', author: 'Momo 妈', emoji: '🐶', color: 'lilac', region: '新界', topic: 'help', date: '2026-11-06', text: '每次拿起牵引绳，Momo 就在门口转圈。有宠友愿意分享出门前的训练方法吗？', likes: 3},
  {id: 'seed-p1', author: '可乐爸', emoji: '🐕', color: 'peach', region: '港岛', date: '2026-11-08', text: '今天在海滨捡到一片比可乐耳朵还大的叶子。它一路叼回家，谁也不肯给。', likes: 4},
  {id: 'seed-p2', author: '豆包姐姐', emoji: '🐩', color: 'lilac', region: '九龙', date: '2026-11-07', text: '最近把梳毛拆成了两分钟一次，豆包终于愿意趴下等我梳完一边了。', likes: 3},
  {id: 'seed-p3', topic: 'walk', author: '糯米爸', emoji: '🦮', color: 'sage', region: '新界', date: '2026-11-06', text: '今天试了大埔的新路线。糯米闻得太认真，走了半小时还没走出第一条街。', likes: 6},
];
const storageKey = 'pawprint.demo.v1';
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const recapDog = new Image();
recapDog.src = './corgi.svg';
let timelineFilter = 'all';
let topicFilter = 'all';
let toastTimer;
let focusAfterClose;
let state = {
  records: [], posts: [], likes: [], savedWalks: [], replies: [], pets: [], activePet: demoPet.id, region: '港岛',
};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.records) && Array.isArray(saved.posts) && Array.isArray(saved.likes)) {
    state = {
      ...state,
      ...saved,
      region: regions.includes(saved.region) ? saved.region : '港岛',
      pets: Array.isArray(saved.pets) ? saved.pets : [],
      replies: Array.isArray(saved.replies) ? saved.replies : [],
      savedWalks: Array.isArray(saved.savedWalks) ? saved.savedWalks.filter(region => regions.includes(region)) : [],
    };
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

function today(date = new Date()) {
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function dateLabel(date) {
  const [year, month, day] = date.split('-');
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function activePet() {
  return state.pets.find(pet => pet.id === state.activePet) ?? demoPet;
}

function petPicker() {
  const selected = activePet();
  const options = [demoPet, ...state.pets].map(pet => `<option value="${pet.id}"${pet.id === selected.id ? ' selected' : ''}>${escapeHtml(pet.name)}${pet.id === demoPet.id ? '（示例）' : ''}</option>`).join('');
  return `<section class="pet-picker"><label>当前宠物<select id="active-pet">${options}</select></label><button class="button outline" data-action="add-pet">${icon('plus')}添加宠物</button>${selected.id !== demoPet.id ? '<button class="button quiet" data-action="edit-pet">编辑档案</button>' : ''}</section>`;
}

function ownRecords() {
  const id = activePet().id;
  return state.records.filter(record => (record.petId ?? demoPet.id) === id);
}

function records() {
  const examples = activePet().id === demoPet.id ? seedRecords : [];
  return [...ownRecords(), ...examples].sort((first, second) => second.date.localeCompare(first.date));
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

function periodEnding(end, days) {
  const start = new Date(end + 'T12:00:00');
  start.setDate(start.getDate() - (days - 1));
  return today(start);
}

function recapData(days) {
  const end = today();
  const start = periodEnding(end, days);
  const own = ownRecords().filter(record => record.date >= start && record.date <= end);
  const example = own.length === 0 && activePet().id === demoPet.id;
  const demoEnd = '2026-11-09';
  const demoStart = periodEnding(demoEnd, days);
  const items = example ? seedRecords.filter(record => record.date >= demoStart && record.date <= demoEnd) : own;
  return {
    example,
    start: example ? demoStart : start,
    end: example ? demoEnd : end,
    total: items.length,
    dates: new Set(items.map(record => record.date)).size,
    moments: items.filter(record => record.type === 'moment').length,
  };
}

function recapTile() {
  const data = recapData(7);
  return `<section class="recap-tile">
    <div class="recap-copy">
      <p class="eyebrow">${icon('spark')} GROWTH RECAP</p>
      <h2>${escapeHtml(activePet().name)}的成长回顾</h2>
      <p>7 天 · ${data.total} 笔记录 · ${data.example ? '示例' : '本机记录'}</p>
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
  dialog.querySelector('#recap-source').textContent = data.example
    ? '所选时段暂无本机记录，当前显示示例卡。'
    : '回顾卡使用此浏览器的记录，只展示日期和次数。';
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
  font(`最近 ${days} 天 · ${data.example ? '示例记录' : '本机记录'}`, 49, 303, 25, yellow);
  font(period, 49, 342, 20, cream, 500);
  if (pet.id === demoPet.id && recapDog.complete && recapDog.naturalWidth) {
    context.drawImage(recapDog, 250, 264, 440, 293);
  } else {
    font(petKinds[pet.kind][1], 475, 500, 133, cream);
  }
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

recapDog.addEventListener('load', updateRecap);

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
      return `<article class="entry"><span class="tile-icon ${due ? 'rose' : 'sage'}">${icon('clock')}</span><div class="entry-text"><span class="entry-meta">${dateLabel(record.nextDate)} · ${due ? '已到期' : '待办'}${record.id.startsWith('seed-') ? ' · 示例' : ''}</span><h3>${escapeHtml(record.value)}</h3></div><button class="button outline" data-action="complete-plan" data-id="${record.id}">记完成</button></article>`;
    }).join('') : '<p class="empty">在疫苗、驱虫或就诊记录里填写「下次日期」，这里就会显示待办。</p>'}</div></section>`;
}

function profile() {
  const pet = activePet();
  const example = pet.id === demoPet.id;
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
          <span class="pill hero-label">${icon('paw')} ${example ? '示例宠物' : '我的宠物'}</span>
          <h2>${escapeHtml(pet.name)}<span>${example ? 'PUDDING' : 'MY PET'}</span></h2>
          <p>${escapeHtml(pet.breed || petKinds[pet.kind][0])}${example ? ' <span>·</span> 2 岁 <span>·</span> 男孩' : ''}</p>
          <div class="hero-actions">${button('记一笔', 'record')}<button class="button hero-secondary" data-action="moment">${icon('heart')}记日常</button></div>
        </div>
        ${example ? '<img src="./corgi.svg" alt="戴着绿色项圈的柯基布丁">' : `<span class="pet-avatar" aria-hidden="true">${petKinds[pet.kind][1]}</span>`}
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
  const all = records();
  const filtered = timelineFilter === 'all' ? all : all.filter(record => record.type === timelineFilter);
  const filters = [['all', '全部'], ...Object.entries(types).map(([key, type]) => [key, type.label])];
  return `${header('GROWTH JOURNAL · 02', '成长时间线', '从一次称重到每次接种，按日期回看成长。', button('记一笔', 'record'))}
    ${petPicker()}
    <div class="timeline-feature">${chart(all.filter(record => record.type === 'weight'))}${recapTile()}</div>
    <section class="section"><div class="section-title"><h2>成长记录</h2><span class="muted">${filtered.length} 条</span></div><div class="chips" aria-label="记录类型">${filters.map(([key, label]) => `<button class="chip" data-filter="${key}" aria-pressed="${timelineFilter === key}">${label}</button>`).join('')}</div><div class="card entries">${filtered.length ? filtered.map(record => entry(record, true)).join('') : '<p class="empty">这里还没有记录。可以从「记一笔」开始。</p>'}</div></section>`;
}

function postCard(post) {
  const own = post.author === '我';
  const liked = state.likes.includes(post.id);
  const count = state.replies.filter(reply => reply.postId === post.id).length;
  return `<article class="card post"><div class="post-head"><span class="avatar ${post.color}" aria-hidden="true">${post.emoji}</span><div><h3>${post.author}</h3><p>${post.region} · ${dateLabel(post.date)}${own ? ' · 本机动态' : ' · 示例'}</p></div><span class="post-topic">${topics[post.topic ?? 'daily']}</span></div><p class="post-body">${escapeHtml(post.text)}</p><div class="post-actions"><button class="button quiet like" data-action="like" data-id="${post.id}" aria-label="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">${icon('heart')}${post.likes + Number(liked)}</button><button class="button quiet" data-action="reply" data-id="${post.id}">${icon('chat')}评论 ${count}</button></div></article>`;
}

function walkCard() {
  const walk = walks[state.region];
  const saved = state.savedWalks.includes(state.region);
  return `<section class="walk-card ${walk.scene}" aria-label="散步灵感">
    <div class="walk-copy">
      <p class="eyebrow">${icon('pin')} ${state.region} · 散步灵感 · 示例</p>
      <h2>${walk.title}</h2><p>${walk.detail}</p>
      <div class="walk-actions">
        <button class="button walk-save" data-action="save-walk" aria-pressed="${saved}">${icon(saved ? 'check' : 'bookmark')}${saved ? '已收藏' : '收藏灵感'}</button>
        <button class="button quiet" data-action="log-walk">${icon('plus')}记一次散步</button>
      </div>
    </div>
    <svg class="walk-art" viewBox="0 0 180 120" aria-hidden="true"><path d="M-8 106C27 42 58 105 88 71c27-31 47-41 96-41v92H-8Z" fill="currentColor" opacity=".24"/><circle cx="128" cy="32" r="14" fill="#f6d593"/><path d="M-5 111c40-38 66 10 106-17 21-14 39-34 79-24" stroke="#fffdf4" stroke-width="3" stroke-dasharray="5 8" fill="none"/><path d="M39 77V50m0 14-11-9m11 6 11-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="39" cy="44" r="15" fill="currentColor" opacity=".38"/></svg>
  </section>`;
}

function community() {
  const nearby = friends.filter(friend => friend.region === state.region);
  const feed = [...state.posts, ...seedPosts].filter(post => post.region === state.region && (topicFilter === 'all' || (post.topic ?? 'daily') === topicFilter));
  const filters = [['all', '全部'], ...Object.entries(topics)];
  return `${header('PET NEIGHBOURS · 03', '同城社区', '看看同区宠友的日常，或问问大家怎么养宠。', button('发动态', 'post'))}
    <section class="region-panel" aria-label="选择社区区域"><div class="region-copy"><span class="tile-icon sage">${icon('pin')}</span><div><h2>我的地区</h2><p>选择区域查看同区的示例宠友和动态</p></div></div><div class="chips" aria-label="社区区域">${regions.map(region => `<button class="chip" data-region="${region}" aria-pressed="${state.region === region}">${region}</button>`).join('')}</div></section>
    ${walkCard()}
    <section class="section"><div class="section-title"><h2>${state.region}宠友</h2><span class="muted">${nearby.length} 位示例宠友</span></div><div class="friend-grid">${nearby.map(friend => `<article class="card friend"><span class="avatar ${friend.color}" aria-hidden="true">${friend.emoji}</span><div><h3>${friend.name}</h3><p>${friend.pet}</p><p>${friend.bio}</p></div></article>`).join('')}</div></section>
    <section class="section"><div class="section-title"><h2>${state.region}动态</h2><span class="muted">${feed.length} 条</span></div><div class="chips" aria-label="动态话题">${filters.map(([key, title]) => `<button class="chip" data-topic="${key}" aria-pressed="${key === topicFilter}">${title}</button>`).join('')}</div><div class="feed">${feed.length ? feed.map(postCard).join('') : '<div class="card entries"><p class="empty">这个地区还没有这类动态，可以发一条。</p></div>'}</div></section>`;
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

function openDialog(title, fields, submit, trigger, isDownload = false) {
  focusAfterClose = trigger;
  const primary = isDownload
    ? `<a id="recap-download" class="button primary" hidden>${icon('download')}${submit}</a>`
    : `<button class="button primary" type="submit">${submit}</button>`;
  dialog.innerHTML = `<form id="editor"><div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="button quiet close" type="button" data-action="close" aria-label="关闭">${icon('close')}</button></div>${fields}<div class="dialog-actions"><button class="button quiet" type="button" data-action="close">取消</button>${primary}</div></form>`;
  dialog.showModal();
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

function openPost(trigger, record) {
  const draft = record ? `${activePet().name}的${types[record.type].label}记录：${recordTitle(record)}。` : '';
  const topic = record || topicFilter === 'all' ? 'daily' : topicFilter;
  openDialog(record ? '分享成长记录' : '发布动态', `<input name="mode" type="hidden" value="post"><div class="form-row"><label>发布区域<select name="region">${regions.map(region => `<option${state.region === region ? ' selected' : ''}>${region}</option>`).join('')}</select></label><label>话题<select name="topic">${Object.entries(topics).map(([key, title]) => `<option value="${key}"${key === topic ? ' selected' : ''}>${title}</option>`).join('')}</select></label></div><label>动态内容<textarea name="text" rows="4" maxlength="280" placeholder="想分享哪件养宠小事？" required>${escapeHtml(draft)}</textarea></label><p class="muted">内容仅在此浏览器的社区演示中显示。</p>`, '发布动态', trigger);
}

function openPet(trigger, pet) {
  const options = Object.entries(petKinds).map(([key, [title]]) => `<option value="${key}"${key === pet?.kind ? ' selected' : ''}>${title}</option>`).join('');
  openDialog(pet ? '编辑宠物档案' : '添加宠物', `<input name="mode" type="hidden" value="pet"><input name="petId" type="hidden" value="${pet?.id ?? ''}"><label>宠物名字<input name="name" maxlength="16" required value="${escapeHtml(pet?.name ?? '')}"></label><div class="form-row"><label>宠物类型<select name="kind">${options}</select></label><label>品种（选填）<input name="breed" maxlength="24" value="${escapeHtml(pet?.breed ?? '')}"></label></div>`, '保存档案', trigger);
}

function openReplies(trigger, postId) {
  const replies = state.replies.filter(reply => reply.postId === postId);
  const list = replies.length ? `<ul class="reply-list">${replies.map(reply => `<li><strong>我</strong><p>${escapeHtml(reply.text)}</p></li>`).join('')}</ul>` : '<p class="muted">还没有评论。</p>';
  openDialog('动态评论', `<input name="mode" type="hidden" value="reply"><input name="postId" type="hidden" value="${postId}">${list}<label>写评论<textarea name="text" maxlength="160" rows="3" required></textarea></label><p class="muted">评论保存在此浏览器。</p>`, '保存评论', trigger);
}

main.addEventListener('change', event => {
  if (event.target.id !== 'active-pet') return;
  state.activePet = event.target.value;
  timelineFilter = 'all';
  save();
  render();
  main.querySelector('#active-pet').focus();
});

main.addEventListener('click', event => {
  const control = event.target.closest('button');
  if (!control) return;
  const {action, filter, region, id, topic} = control.dataset;
  if (topic) {
    topicFilter = topic;
    render();
    main.querySelector(`[data-topic="${topic}"]`).focus();
  }
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
  if (action === 'add-pet') openPet(control);
  if (action === 'edit-pet') openPet(control, activePet());
  if (action === 'complete-plan') {
    const record = records().find(record => record.id === id);
    openRecord(control, record.type, record.value);
  }
  if (action === 'moment') openRecord(control, 'moment');
  if (action === 'log-walk') openRecord(control, 'moment', walks[state.region].title);
  if (action === 'recap') openRecap(control);
  if (action === 'save-walk') {
    const saved = state.savedWalks.includes(state.region);
    state.savedWalks = saved ? state.savedWalks.filter(region => region !== state.region) : [...state.savedWalks, state.region];
    const persisted = save();
    render();
    main.querySelector('[data-action="save-walk"]').focus();
    toast(persisted ? (saved ? '已取消收藏' : '已收藏到此浏览器') : '浏览器储存不可用，刷新后会清除');
  }
  if (action === 'post') openPost(control);
  if (action === 'share') openPost(control, records().find(record => record.id === id));
  if (action === 'reply') openReplies(control, id);
  if (action === 'like') {
    state.likes = state.likes.includes(id) ? state.likes.filter(like => like !== id) : [...state.likes, id];
    save();
    render();
    main.querySelector(`[data-action="like"][data-id="${id}"]`).focus();
  }
});

dialog.addEventListener('click', event => {
  if (event.target.closest('[data-action="close"]')) dialog.close();
});
dialog.addEventListener('change', event => {
  if (event.target.name === 'type') dialog.querySelector('#record-field').innerHTML = recordField(event.target.value);
  if (event.target.name === 'days') updateRecap();
});
dialog.addEventListener('input', event => {
  event.target.setCustomValidity?.('');
  if (event.target.name === 'date') dialog.querySelector('[name="nextDate"]')?.setCustomValidity('');
});
dialog.addEventListener('close', () => {
  if (focusAfterClose?.isConnected) focusAfterClose.focus();
});
dialog.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  if (values.mode === 'recap') return;
  const isRecord = values.mode === 'record';
  const required = form.elements[isRecord ? 'value' : values.mode === 'pet' ? 'name' : 'text'];
  const content = required.value.trim();
  if (!content) {
    required.setCustomValidity('请输入内容。');
    required.reportValidity();
    return;
  }
  if (values.nextDate && values.nextDate < values.date) {
    form.elements.nextDate.setCustomValidity('下次日期须在记录日期当日或之后。');
    form.elements.nextDate.reportValidity();
    return;
  }
  const id = crypto.randomUUID();
  let message;
  let destination = location.hash;
  if (isRecord) {
    state.records.unshift({id, petId: activePet().id, type: values.type, date: values.date, value: content, note: values.note.trim(), nextDate: values.nextDate || ''});
    timelineFilter = 'all';
    message = '已添加到成长时间线';
    destination = '#timeline';
  } else if (values.mode === 'pet') {
    const pet = {id: values.petId || id, name: content, kind: values.kind, breed: values.breed.trim()};
    state.pets = values.petId ? state.pets.map(item => item.id === pet.id ? pet : item) : [...state.pets, pet];
    state.activePet = pet.id;
    timelineFilter = 'all';
    message = '宠物档案已保存';
  } else if (values.mode === 'reply') {
    state.replies.push({postId: values.postId, text: content});
    message = '评论已保存';
  } else {
    state.region = values.region;
    topicFilter = values.topic;
    state.posts.unshift({id, author: '我', emoji: '🐾', color: 'peach', region: values.region, topic: values.topic, date: today(), text: content, likes: 0});
    message = `已发布到${values.region}动态`;
    destination = '#community';
  }
  const persisted = save();
  dialog.close();
  if (location.hash !== destination) location.hash = destination;
  else render({focus: values.mode !== 'reply'});
  if (values.mode === 'reply') main.querySelector(`[data-action="reply"][data-id="${values.postId}"]`)?.focus();
  toast(persisted ? message : `${message}，刷新后会清除`);
});
window.addEventListener('hashchange', () => render({focus: true}));
render();
