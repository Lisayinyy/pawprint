'use strict';

const walkSlots = {morning: '早上', afternoon: '下午', evening: '晚上'};
const routeTags = {quiet: '人少安静', shade: '有遮阴', stepfree: '少台阶', other: '其他'};
const careTypes = ['vaccine', 'care', 'visit', 'medication', 'hygiene'];

function options(items, selected) {
  return Object.entries(items).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
}

function routeFields() {
  return `<fieldset class="route-fields" hidden disabled>
    <legend>同区试走卡</legend>
    <p class="muted">请用公共地标。其他宠友可以按时段补充他们走过的体验。</p>
    <label>路线名称<input name="routeName" maxlength="40" required placeholder="例如 海滨短走"></label>
    <div class="form-row"><label>公共起点<input name="start" maxlength="60" required></label><label>公共终点<input name="finish" maxlength="60" required></label></div>
    <div class="form-row"><label>到访日期<input name="routeDate" type="date" value="${today()}" max="${today()}" required></label><label>时长（分钟）<input name="minutes" type="number" min="1" max="999" required></label></div>
    <div class="form-row"><label>时段<select name="slot">${options(walkSlots)}</select></label><label>最明显的特点<select name="tag">${options(routeTags)}</select></label></div>
  </fieldset>`;
}

function syncRouteFields(form) {
  const fields = form.querySelector('.route-fields');
  fields.hidden = form.elements.topic.value !== 'walk';
  fields.disabled = fields.hidden;
}

function routeMarkup(route) {
  return `<div class="route-ticket">
    <span class="route-kicker">${icon('pin')} 同区试走卡</span>
    <h4>${escapeHtml(route.name)}</h4>
    <ol class="route-stops"><li>${escapeHtml(route.start)}</li><li>${escapeHtml(route.finish)}</li></ol>
    <p>${escapeHtml(route.date)} · ${walkSlots[route.slot] || ''} · ${escapeHtml(route.minutes)} 分钟 · ${routeTags[route.tag] || ''}</p>
  </div>`;
}

function openWalk(trigger, post) {
  if (!post?.route || !activePet()) return;
  openDialog('我也走了', `<input name="mode" type="hidden" value="walk-log"><input name="postId" type="hidden" value="${post.id}">
    ${routeMarkup(post.route)}
    <p class="muted">这次散步会存入${escapeHtml(activePet().name)}的私人时间线。</p>
    <div class="form-row"><label>到访日期<input type="date" name="date" value="${today()}" max="${today()}" required></label>
    <label>时段<select name="slot">${options(walkSlots)}</select></label></div>
    <label>时长（分钟）<input type="number" name="minutes" min="1" max="999" value="${escapeHtml(post.route.minutes)}" required></label>
    <label class="inline-check"><input type="checkbox" name="shareWalk">同时向${escapeHtml(state.region)}宠友分享路况</label>
    <div id="walk-feedback" hidden><label>分享路况<textarea name="feedback" maxlength="160" rows="3" disabled placeholder="例如 下午人多，入口旁的饮水点可用"></textarea></label></div>`, '保存这次散步', trigger);
}

function openOutcome(trigger, post) {
  if (!post || post.author_id !== user.id) return;
  openDialog('补充试过后的结果', `<input name="mode" type="hidden" value="outcome"><input name="postId" type="hidden" value="${post.id}">
    <input name="replyId" type="hidden" value="${escapeHtml(trigger.dataset.replyId || post.outcome_reply || '')}">
    <p class="muted">后续会显示在原帖和同区社区。</p>
    <label>试过以后<textarea name="outcome" rows="4" maxlength="160" required placeholder="试了什么，实际怎么样？">${escapeHtml(post.outcome || '')}</textarea></label>`, '保存后续', trigger);
}

function saveText(file, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = file;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openBrief(trigger, handoff = false) {
  if (!activePet()) return;
  const title = handoff ? '照护交接单' : '就诊前一页摘要';
  openDialog(title, `<input name="mode" type="hidden" value="brief">
    <p class="muted">选出要分享的记录，确认预览后下载。原始档案仍保存在你的私人空间。</p>
    <label>时间范围<select name="briefDays"><option value="7">最近 7 天</option><option value="30" selected>最近 30 天</option><option value="90">最近 90 天</option></select></label>
    <fieldset class="brief-choices"><legend>包含的记录</legend>
      ${Object.entries(types).filter(([key]) => handoff ? ['meal','walk','medication','hygiene','care','moment'].includes(key) : ['weight','symptom','medication','vaccine','care','visit'].includes(key)).map(([key, item]) => `<label class="inline-check"><input type="checkbox" name="briefType" value="${key}" checked>${item.label}</label>`).join('')}
      <label class="inline-check"><input type="checkbox" name="briefNotes">包含记录备注</label>
    </fieldset>
    <label>${handoff ? '交代给照护者的话' : '想问兽医的问题'}<textarea name="briefQuestion" rows="2" maxlength="240"></textarea></label>
    <div><strong>下载预览</strong><pre class="brief-preview"></pre></div>`, '下载摘要', trigger);
  dialog.querySelector('form').dataset.brief = title;
  refreshBrief();
}

function refreshBrief() {
  const form = dialog.querySelector('form');
  const pet = activePet();
  const selected = new FormData(form);
  const end = today();
  const start = periodEnding(end, Number(selected.get('briefDays')));
  const include = new Set(selected.getAll('briefType'));
  const matching = records().filter(item => item.date >= start && item.date <= end && include.has(item.type));
  const lines = [`${pet.name} · ${form.dataset.brief}`, pet.breed || petKinds[pet.kind][0], `${start} 至 ${end}`, ''];
  for (const item of matching.slice(0, 12)) {
    const note = selected.has('briefNotes') && item.note ? `（${item.note}）` : '';
    const next = item.nextDate ? ` · 下次 ${item.nextDate}` : '';
    lines.push(`${item.date} · ${types[item.type].label} · ${recordTitle(item)}${note}${next}`);
  }
  if (!matching.length) lines.push('所选日期内没有对应记录。');
  if (matching.length > 12) lines.push(`显示最近 12 条，共 ${matching.length} 条。`);
  const question = selected.get('briefQuestion').trim();
  if (question) lines.push('', form.dataset.brief === '照护交接单' ? '交接事项' : '想问兽医的问题', question);
  form.querySelector('.brief-preview').textContent = lines.join('\n');
}

function calendarReminder(record) {
  if (!record?.nextDate) return;
  const icsEscape = value => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
  const title = icsEscape(`${activePet().name} · ${record.value}`);
  const due = record.nextDate.replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Pawprint//Care//ZH','BEGIN:VEVENT',
    `UID:${record.id}-${due}@pawprint`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${due}`, `SUMMARY:${title}`,
    'BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY',`DESCRIPTION:${title}`,'END:VALARM','END:VEVENT','END:VCALENDAR',''];
  const encoder = new TextEncoder();
  const folded = lines.map(line => {
    let width = 0;
    let result = '';
    for (const char of line) {
      const bytes = encoder.encode(char).length;
      if (width + bytes > 75) { result += '\r\n '; width = 1; }
      result += char;
      width += bytes;
    }
    return result;
  });
  saveText('爪印日记-护理提醒.ics', folded.join('\r\n'), 'text/calendar;charset=utf-8');
  toast('已下载日历文件，打开后添加提醒');
}
