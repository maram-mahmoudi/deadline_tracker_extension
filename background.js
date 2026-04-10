chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('reminder_')) return;
  const eventId = alarm.name.replace('reminder_', '');
  const data = await chrome.storage.local.get('events');
  const events = Array.isArray(data.events) ? data.events : [];
  const event = events.find(e => e.id === eventId);
  if (!event || event.done) return;

  const mins = Math.ceil((new Date(event.deadline).getTime() - Date.now()) / 60000);
  let body = '';
  if (mins < 0) {
    const overdue = Math.abs(mins);
    const d = Math.floor(overdue / 1440);
    const h = Math.floor((overdue % 1440) / 60);
    const m = overdue % 60;
    body = d > 0 ? `This was due ${d}d ago.` : h > 0 ? `This was due ${h}h ago.` : `This was due ${m}m ago.`;
  } else {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    body = d > 0 ? `${d}d ${h}h ${m}m remaining.` : h > 0 ? `${h}h ${m}m remaining.` : `${m}m remaining.`;
  }

  chrome.notifications.create(`notif-${eventId}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: `Reminder: ${event.name}`,
    message: body,
    priority: 2
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('events');
  const events = Array.isArray(data.events) ? data.events : [];
  events.forEach(event => {
    if (event.reminder && event.reminder !== 'none' && !event.done) scheduleAlarm(event);
  });
});

function scheduleAlarm(event) {
  const alarmName = `reminder_${event.id}`;
  chrome.alarms.clear(alarmName);
  if (!event.reminder || event.reminder === 'none' || event.done) return;
  const periodInMinutes = reminderToPeriod(event.reminder);
  if (!periodInMinutes) return;
  const now = new Date();
  const next9am = new Date();
  next9am.setHours(9, 0, 0, 0);
  if (next9am <= now) next9am.setDate(next9am.getDate() + 1);
  chrome.alarms.create(alarmName, { when: next9am.getTime(), periodInMinutes });
}

function reminderToPeriod(reminder) {
  switch (reminder) {
    case 'daily': return 60 * 24;
    case 'every2days': return 60 * 24 * 2;
    case '3xweek': return Math.round((60 * 24 * 7) / 3);
    case 'weekly': return 60 * 24 * 7;
    default: return null;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'scheduleAlarm') scheduleAlarm(msg.event);
  if (msg.type === 'clearAlarm') chrome.alarms.clear(`reminder_${msg.eventId}`);
  if (msg.type === 'syncAllEvents') {
    chrome.storage.local.get('events').then(data => {
      const events = Array.isArray(data.events) ? data.events : [];
      chrome.alarms.getAll().then(alarms => {
        alarms.filter(a => a.name.startsWith('reminder_')).forEach(a => chrome.alarms.clear(a.name));
        events.forEach(event => {
          if (event.reminder && event.reminder !== 'none' && !event.done) scheduleAlarm(event);
        });
      });
    });
  }
});
