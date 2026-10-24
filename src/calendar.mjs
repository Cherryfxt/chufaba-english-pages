// Calendar evidence is limited to persisted completion, correction and activity dates.
export function todayKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
}
export function monthKey(now = new Date()) { return todayKey(now).slice(0, 7); }

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calendarHTML(state, {month = monthKey(), activity = []} = {}) {
  if (!validDate(`${month}-01`)) month = monthKey();
  const records = new Map();
  function dayRecord(date) {
    if (!validDate(date)) return null;
    if (!records.has(date)) records.set(date, {completed: new Set(), corrections: new Set(), study: new Set()});
    return records.get(date);
  }
  for (const session of state?.sessions || []) {
    if (session.completedDay) dayRecord(session.completedDay)?.completed.add(session.stationID);
  }
  for (const event of state?.correctionEvents || []) dayRecord(event.date)?.corrections.add(event.stationID);
  for (const event of activity || []) dayRecord(event.date)?.study.add(event.stationID);

  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(`${month}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const end = new Date(first); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const count = end.getUTCDate();
  const today = todayKey();
  const currentRecords = [...records].filter(([date]) => date.startsWith(`${month}-`));
  const completed = currentRecords.reduce((sum, [, record]) => sum + record.completed.size, 0);
  const corrected = currentRecords.filter(([, record]) => record.corrections.size).length;
  const cells = Array.from({length: offset}, () => '<div class="calendar-day empty" aria-hidden="true"></div>');
  for (let day = 1; day <= count; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`, record = records.get(date);
    const completionCount = record?.completed.size || 0;
    const hasCorrections = !!record?.corrections.size;
    const hasStudy = !!record?.study.size;
    const label = completionCount ? `完成${completionCount}站` : hasCorrections ? '订正' : hasStudy ? '学习' : '';
    const detail = [completionCount ? `完成第${[...record.completed].join('、')}站` : '', hasCorrections ? `订正第${[...record.corrections].join('、')}站` : '', hasStudy ? '有学习记录' : ''].filter(Boolean).join('；');
    // Escape accessible text as defensively as visible markup.
    const safeDetail = detail.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    cells.push(`<div class="calendar-day${record ? ' active' : ''}${completionCount ? ' completed' : ''}${date === today ? ' today' : ''}" data-date="${date}" aria-label="${monthNumber}月${day}日${date === today ? '，今天' : ''}${safeDetail ? `，${safeDetail}` : '，暂无记录'}"${date === today ? ' aria-current="date"' : ''}><span class="calendar-date">${day}</span><span class="calendar-mark">${label || '&nbsp;'}</span>${completionCount && hasCorrections ? '<span class="calendar-correction">含订正</span>' : ''}</div>`);
  }
  while (cells.length % 7) cells.push('<div class="calendar-day empty" aria-hidden="true"></div>');
  return `<section class="panel calendar-panel" aria-label="学习日历"><div class="calendar-heading"><button data-act="calendar-prev" aria-label="上个月">上个月</button><h2>${year}年${monthNumber}月</h2><button data-act="calendar-next" aria-label="下个月">下个月</button></div><div class="calendar-summary"><span>学习 <strong>${currentRecords.length}</strong> 天</span><span>完成 <strong>${completed}</strong> 站</span><span>订正 <strong>${corrected}</strong> 天</span></div><div class="calendar-grid" aria-label="${year}年${monthNumber}月学习记录">${['一','二','三','四','五','六','日'].map(day => `<div class="calendar-weekday">周${day}</div>`).join('')}${cells.join('')}</div><p class="calendar-note muted">历史存档中未记录的练习日期无法恢复；空白日期不代表没有学习。完赛和订正随存档备份；新记录的学习日期仅保存在当前浏览器。</p></section>`;
}
