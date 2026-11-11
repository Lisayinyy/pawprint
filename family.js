'use strict';

const careKinds = {meal: '喂食', medication: '用药', walk: '散步'};
const careInviteKey = 'pawprint.care-invite';
const careClock = new Intl.DateTimeFormat('zh-HK', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const emptyFamily = () => ({circles: [], events: [], members: [], id: null, error: '', ready: false});
let family = emptyFamily();
let familyRequest = 0;
let familyPreferred;
let careChannel;
let careWatchKey = '';
let careInvite = '';

function captureCareInvite() {
  if (demoMode) {
    if (location.hash.startsWith('#care/')) history.replaceState(history.state, '', '#care');
    return;
  }
  const match = /^#care\/([a-f0-9]{64})$/.exec(location.hash);
  try {
    if (match) sessionStorage.setItem(careInviteKey, match[1]);
    careInvite = sessionStorage.getItem(careInviteKey) || '';
  } catch {}
  if (match) {
    careInvite = match[1];
    history.replaceState(history.state, '', '#care');
  }
}

function forgetCareInvite() {
  careInvite = '';
  try { sessionStorage.removeItem(careInviteKey); } catch {}
}

function stopCareWatch() {
  careChannel?.();
  careChannel = undefined;
  careWatchKey = '';
}

function resetCare() {
  family = emptyFamily();
  familyPreferred = undefined;
  ++familyRequest;
  stopCareWatch();
}

async function refreshCare(preferredId) {
  if (!account || location.hash !== '#care') return;
  if (preferredId) familyPreferred = preferredId;
  const request = ++familyRequest;
  const expected = sessionNumber;
  const isCurrent = () => expected === sessionNumber && request === familyRequest && location.hash === '#care';
  try {
    const circles = await cloud.careCircles();
    if (!isCurrent()) return;
    const circle = circles.find(item => item.id === (familyPreferred || family.id)) || circles[0];
    const key = `${user.id}:${circle?.id || ''}`;
    if (key !== careWatchKey) {
      stopCareWatch();
      careWatchKey = key;
      careChannel = cloud.watchCare(user.id, circle?.id, () => void refreshCare());
    }
    const [events, members] = circle ? await Promise.all([
      cloud.careEvents(circle.id), circle.owner_id === user.id ? cloud.careMembers(circle.id) : [],
    ]) : [[], []];
    if (!isCurrent()) return;
    const next = {circles, events, members, id: circle?.id || null, error: '', ready: true};
    if (JSON.stringify(family) !== JSON.stringify(next)) {
      family = next;
      render();
    }
  } catch {
    if (isCurrent()) {
      family = {...emptyFamily(), error: '暂时无法更新照护记录。'};
      render();
    }
  }
}

function carePage() {
  const circle = family.circles.find(item => item.id === family.id);
  const owned = state.pets.some(pet => !family.circles.some(item => item.id === pet.id));
  const owner = circle?.owner_id === user.id;
  return `${header('', '家庭照护', '一起记录喂食、用药和散步，看看谁在什么时候照护过。')}
    ${careInvite ? '<aside class="care-banner"><p>你有一条待接受的照护邀请。</p><button class="button primary" data-action="care-join">查看邀请</button><button class="button quiet" data-action="care-dismiss">忽略</button></aside>' : ''}
    ${family.error ? `<p role="status">${family.error} <button class="button outline" data-action="care-refresh">重试</button></p>` : ''}
    ${!family.ready && !family.error ? '<p class="muted" role="status">正在读取照护记录…</p>' : ''}
    ${family.ready ? `<section class="care-toolbar">
      ${circle ? `<label>照护中的宠物<select id="care-circle">${family.circles.map(item =>
        `<option value="${escapeHtml(item.id)}"${item.id === family.id ? ' selected' : ''}>${escapeHtml(item.pet_name)}${item.owner_id === user.id ? '' : '（家人邀请）'}</option>`).join('')}</select></label>` : ''}
      <div class="entry-actions">
        ${owned ? '<button class="button outline" data-action="care-create">为宠物开启共管</button>' : ''}
        ${demoMode ? '' : '<button class="button quiet" data-action="care-join">输入邀请码</button>'}
      </div></section>` : ''}
    ${family.ready && !circle ? '<div class="card empty-panel"><h2>还没有共管宠物</h2><p>为自己的宠物开启共管，或接受家人的邀请。</p><a href="#profile">打开宠物档案</a></div>' : ''}
    ${circle ? `<section class="care-journal card" aria-label="共享照护记录">
      <div class="care-journal-head"><div><h2>${escapeHtml(circle.pet_name)}的照护记录</h2><p>仅共管成员可见 · 香港时间</p></div>
      ${owner ? '<button class="button outline" data-action="care-invite">邀请家人</button>' : ''}</div>
      <div class="care-actions">${Object.entries(careKinds).map(([key,label]) =>
        `<button class="button outline" data-action="care-record" data-id="${key}">${key === 'walk' ? icon('pin') : key === 'medication' ? icon('cross') : icon('paw')}记${label}</button>`).join('')}</div>
      ${family.events.length ? `<ol class="care-events">${family.events.map(event => `<li>
        <div><strong>${careKinds[event.kind]}</strong> <span>${escapeHtml(event.detail)}</span></div>
        <p>${escapeHtml(event.display_name)}${event.author_id === user.id ? '（我）' : ''} · <time datetime="${escapeHtml(event.happened_at)}">${careClock.format(new Date(event.happened_at))}</time></p>
      </li>`).join('')}</ol>` : '<p class="muted">记录一次照护，家人打开这里就能看到。</p>'}
      ${family.events.length === 50 ? '<p class="muted">显示最近 50 条记录。</p>' : ''}
    </section>` : ''}
    ${owner ? `<section class="section care-members"><h2>共管成员</h2><p class="muted">你（主人）</p>
      ${family.members.map(member => `<div class="care-member"><span>${escapeHtml(member.display_name)}</span><button class="button quiet" data-action="care-remove" data-id="${escapeHtml(member.user_id)}">移除</button></div>`).join('')}
      ${family.members.length ? '' : '<p class="muted">邀请家人一起照护。</p>'}</section>` : ''}`;
}

function openCareCreate(trigger) {
  const pets = state.pets.filter(pet => !family.circles.some(item => item.id === pet.id));
  openDialog('开启家庭照护', `<input name="mode" type="hidden" value="care-create">
    <label>选择宠物<select name="petId" required>${pets.map(pet =>
      `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.name)}</option>`).join('')}</select></label>
    <p class="muted">共管成员可以新增喂食、用药和散步。已有的私人档案只对你可见。</p>`,
  '开启共管', trigger);
}

function openCareInvite(trigger) {
  openDialog('邀请家人', `<input name="mode" type="hidden" value="care-invite"><input type="hidden" name="circleId" value="${escapeHtml(family.id)}">
    <p>链接可供一位家人加入，有效期 48 小时。生成新链接会让上一条链接失效。</p>
    ${demoMode ? '<p class="muted">体验版链接只供当前页面体验。</p>' : ''}
    <div class="care-invite-result" hidden><label>邀请链接<input name="inviteLink" type="url" readonly></label>
      <button type="button" class="button outline" data-action="care-copy">复制邀请链接</button></div>
    <button type="button" class="button quiet" data-action="care-cancel-invite">撤销未使用的邀请</button>`,
  '生成邀请链接', trigger);
}

function openCareJoin(trigger) {
  openDialog('加入家庭照护', `<input name="mode" type="hidden" value="care-join">
    <p>加入后可以查看和新增这只宠物的共享照护记录。每条记录会显示昵称和照护时间。</p>
    <label>邀请链接或邀请码<input name="inviteCode" required autocomplete="off" spellcheck="false" maxlength="240" value="${escapeHtml(careInvite)}"></label>`,
  '接受邀请', trigger);
}

function openCareRecord(trigger, kind) {
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const examples = {meal: '例如 晚餐 45 克', medication: '例如 按医嘱给药，记下药名和剂量', walk: '例如 海滨散步 20 分钟'};
  openDialog(`记${careKinds[kind]}`, `<input name="mode" type="hidden" value="care-record">
    <input type="hidden" name="kind" value="${kind}"><input type="hidden" name="circleId" value="${escapeHtml(family.id)}">
    <label>照护时间<input type="datetime-local" name="happenedAt" value="${local}" required></label>
    <label>做了什么<textarea name="detail" rows="3" maxlength="140" required placeholder="${examples[kind]}"></textarea></label>`,
  '保存共享记录', trigger);
}

function openCareRemove(trigger, memberId) {
  const member = family.members.find(item => item.user_id === memberId);
  if (!member) return;
  openDialog('移除共管成员', `<input name="mode" type="hidden" value="care-remove">
    <input type="hidden" name="memberId" value="${escapeHtml(memberId)}"><input type="hidden" name="circleId" value="${escapeHtml(family.id)}">
    <p>移除${escapeHtml(member.display_name)}后，对方将无法查看或新增这只宠物的共享照护记录。已记下的记录会保留。</p>`,
  '确认移除', trigger);
}

async function submitCare(form, values, id, expected) {
  let selected;
  let message;
  if (values.mode === 'care-create') {
    const pet = state.pets.find(item => item.id === values.petId);
    if (!pet) throw new Error('Pet unavailable');
    await cloud.createCare(pet);
    selected = pet.id;
    message = '已开启家庭照护';
  } else if (values.mode === 'care-invite') {
    const code = form.dataset.inviteCode ||= Array.from(crypto.getRandomValues(new Uint8Array(32)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    await cloud.issueCareInvite(values.circleId, code);
    if (expected !== sessionNumber) return;
    delete form.dataset.inviteCode;
    const url = new URL(location.href);
    url.hash = `care/${code}`;
    form.elements.inviteLink.value = url.href;
    form.querySelector('.care-invite-result').hidden = false;
    form.elements.inviteLink.focus();
    form.elements.inviteLink.select();
    return;
  } else if (values.mode === 'care-join') {
    const code = values.inviteCode.trim().match(/(?:^|#care\/)([a-f0-9]{64})$/)?.[1];
    if (!code) {
      dialog.querySelector('#dialog-error').textContent = '请粘贴家人发给你的完整邀请链接或邀请码。';
      return;
    }
    try {
      selected = await cloud.acceptCareInvite(code);
    } catch (error) {
      if (error.code !== 'P0001') throw error;
      if (expected === sessionNumber) dialog.querySelector('#dialog-error').textContent = '这条邀请无法使用，可能已过期、已被领取，或由你自己发出。';
      return;
    }
    if (expected !== sessionNumber) return;
    forgetCareInvite();
    message = '已加入家庭照护';
  } else if (values.mode === 'care-record') {
    const date = new Date(values.happenedAt);
    if (!Number.isFinite(date.valueOf()) || date.valueOf() > Date.now()) {
      dialog.querySelector('#dialog-error').textContent = '照护时间不能晚于现在。';
      return;
    }
    await cloud.addCareEvent({id, circle_id: values.circleId, kind: values.kind,
      detail: values.detail.trim(), happened_at: date.toISOString(), display_name: account.display_name});
    message = '已保存共享记录';
  } else if (values.mode === 'care-remove') {
    await cloud.removeCareMember(values.circleId, values.memberId);
    message = '已移除共管成员';
  }
  if (expected !== sessionNumber) return;
  dialog.close();
  toast(message);
  void refreshCare(selected);
}
