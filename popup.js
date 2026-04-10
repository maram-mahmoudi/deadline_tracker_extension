let events = [];
let editingReminderId = null;
let editingEventId = null;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function load() {
  const data = await chrome.storage.local.get('events');
  events = Array.isArray(data.events) ? data.events : [];
  render();
}

function save() {
  chrome.storage.local.set({ events });
}

function combineDeadline(dateStr, timeStr) {
  const t = timeStr && timeStr.trim() ? timeStr : '23:59';
  return `${dateStr}T${t}:00`;
}

function minutesLeft(deadlineStr) {
  return Math.ceil((new Date(deadlineStr).getTime() - Date.now()) / 60000);
}

function daysLeft(deadlineStr) {
  return Math.ceil(minutesLeft(deadlineStr) / 1440);
}

function urgencyClass(ev) {
  if (ev.done) return 'done';
  const mins = minutesLeft(ev.deadline);
  const days = mins / 1440;
  if (mins < 0) return 'overdue';
  if (days < 7) return 'urgent';
  if (days <= 15) return 'soon';
  return 'ok';
}

function timeLabel(deadlineStr, done) {
  if (done) return 'done';
  const mins = minutesLeft(deadlineStr);
  if (mins < 0) {
    const overdue = Math.abs(mins);
    const d = Math.floor(overdue / 1440);
    const h = Math.floor((overdue % 1440) / 60);
    const m = overdue % 60;
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return `${m}m ago`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(deadlineStr) {
  const d = new Date(deadlineStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function formatSub(deadlineStr, done) {
  if (done) return 'Completed';
  const d = new Date(deadlineStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const hasExplicitTime = !(hh === '23' && mm === '59');
  return hasExplicitTime ? `${hh}:${mm}` : 'End of day';
}

function reminderLabel(r) {
  const map = { daily: 'daily', every2days: '2d', '3xweek': '3/wk', weekly: 'wkly' };
  return map[r] || null;
}

function render() {
  const list = document.getElementById('event-list');
  const count = document.getElementById('header-count');

  const sorted = [...events].sort((a, b) => {
    const ad = new Date(a.deadline).getTime();
    const bd = new Date(b.deadline).getTime();
    if (a.done && !b.done) return 1;
    if (!a.done && b.done) return -1;
    return ad - bd;
  });

  count.textContent = events.length > 0 ? `${events.length} event${events.length !== 1 ? 's' : ''}` : '';

  if (!sorted.length) {
    list.innerHTML = `<div class="empty"><div class="big">⏳</div>No deadlines yet.<br>Add your first one below.</div>`;
    return;
  }

  list.innerHTML = sorted.map((ev) => {
    const cls = urgencyClass(ev);
    const rl = reminderLabel(ev.reminder);
    return `
      <div class="event-row ${cls}" data-id="${ev.id}">
        <div class="event-dot"></div>
        <div class="event-main">
          <div class="event-name" title="${escapeHtml(ev.name)}">${escapeHtml(ev.name)}</div>
          <div class="event-sub">${formatSub(ev.deadline, ev.done)}</div>
        </div>
        ${rl ? `<span class="reminder-badge">${rl}</span>` : ''}
        <div class="event-days">${timeLabel(ev.deadline, ev.done)}</div>
        <div class="event-date">${formatDate(ev.deadline)}</div>
        <div class="event-actions">
          <button class="btn-icon ${ev.reminder && ev.reminder !== 'none' ? 'active' : ''}" title="Set reminder" data-action="reminder" data-id="${ev.id}">🔔</button>
          <button class="btn-icon" title="Edit event" data-action="edit" data-id="${ev.id}">✎</button>
          <button class="btn-icon" title="${ev.done ? 'Mark as active' : 'Mark as done'}" data-action="done" data-id="${ev.id}">✓</button>
          <button class="btn-icon" title="Delete event" data-action="delete" data-id="${ev.id}">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function closeForm() {
  editingEventId = null;
  document.getElementById('save-btn').textContent = 'Add Event';
  document.getElementById('add-form').classList.remove('open');
  document.getElementById('add-toggle-btn').style.display = '';
  document.getElementById('input-name').value = '';
  document.getElementById('input-date').value = '';
  document.getElementById('input-time').value = '';
}

function addOrSaveEvent() {
  const name = document.getElementById('input-name').value.trim();
  const date = document.getElementById('input-date').value;
  const time = document.getElementById('input-time').value;
  if (!name || !date) {
    if (!name) document.getElementById('input-name').focus();
    else document.getElementById('input-date').focus();
    return;
  }

  const deadline = combineDeadline(date, time);
  if (editingEventId) {
    const ev = events.find(e => e.id === editingEventId);
    if (ev) {
      ev.name = name;
      ev.deadline = deadline;
    }
  } else {
    events.push({
      id: `ev-${Date.now()}`,
      name,
      deadline,
      reminder: 'none',
      done: false,
      createdAt: Date.now()
    });
  }

  save();
  render();
  closeForm();
  chrome.runtime.sendMessage({ type: 'syncAllEvents' });
}

function deleteEvent(id) {
  events = events.filter(e => e.id !== id);
  chrome.runtime.sendMessage({ type: 'clearAlarm', eventId: id });
  save();
  render();
}

function startEdit(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  const d = new Date(ev.deadline);
  editingEventId = id;
  document.getElementById('add-toggle-btn').style.display = 'none';
  document.getElementById('add-form').classList.add('open');
  document.getElementById('input-name').value = ev.name;
  document.getElementById('input-date').value = d.toISOString().slice(0, 10);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  document.getElementById('input-time').value = (hh === '23' && mm === '59') ? '' : `${hh}:${mm}`;
  document.getElementById('save-btn').textContent = 'Save';
  document.getElementById('input-name').focus();
}

function toggleDone(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev.done = !ev.done;
  if (ev.done) chrome.runtime.sendMessage({ type: 'clearAlarm', eventId: id });
  else chrome.runtime.sendMessage({ type: 'scheduleAlarm', event: ev });
  save();
  render();
}

function openReminderModal(id) {
  editingReminderId = id;
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  document.getElementById('modal-event-name').textContent = ev.name;
  document.querySelectorAll('.reminder-opt').forEach(el => el.classList.remove('selected'));
  const current = ev.reminder || 'none';
  const target = document.querySelector(`.reminder-opt[data-value="${current}"]`);
  if (target) target.classList.add('selected');
  document.getElementById('modal-overlay').classList.add('open');
}

function bindReminderOptions() {
  document.querySelectorAll('.reminder-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.reminder-opt').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function saveReminder() {
  const selected = document.querySelector('.reminder-opt.selected');
  if (!selected || !editingReminderId) return;
  const val = selected.dataset.value;
  const ev = events.find(e => e.id === editingReminderId);
  if (!ev) return;
  ev.reminder = val;
  save();
  if (val === 'none') chrome.runtime.sendMessage({ type: 'clearAlarm', eventId: ev.id });
  else chrome.runtime.sendMessage({ type: 'scheduleAlarm', event: ev });
  document.getElementById('modal-overlay').classList.remove('open');
  render();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.getElementById('add-toggle-btn').addEventListener('click', () => {
  document.getElementById('add-toggle-btn').style.display = 'none';
  document.getElementById('add-form').classList.add('open');
  document.getElementById('input-name').focus();
});

const today = new Date().toISOString().split('T')[0];
document.getElementById('input-date').min = today;
document.getElementById('cancel-btn').addEventListener('click', closeForm);
document.getElementById('save-btn').addEventListener('click', addOrSaveEvent);
document.getElementById('event-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'reminder') openReminderModal(id);
  if (action === 'edit') startEdit(id);
  if (action === 'done') toggleDone(id);
  if (action === 'delete') deleteEvent(id);
});

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('open');
});
document.getElementById('modal-save').addEventListener('click', saveReminder);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) document.getElementById('modal-overlay').classList.remove('open');
});

document.getElementById('input-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('input-date').focus();
});
document.getElementById('input-date').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addOrSaveEvent();
});

bindReminderOptions();
load();
setInterval(render, 60000);
