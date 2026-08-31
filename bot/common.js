const admin = require('firebase-admin');

function initDb() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = 'https://mukovnin2023-debug.github.io/tracker-1000-days/app/';

async function tg(method, payload) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

function sendMessage(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
}

// Локальная дата (YYYY-MM-DD) в часовом поясе пользователя — тот же принцип,
// что и в самом приложении (getFullYear/getMonth/getDate, но для конкретного tz).
function localDateInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch (e) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  }
}

function localHourInTz(tz) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()));
  } catch (e) {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }).format(new Date()));
  }
}

function dayNumberFor(startDate, isoDate) {
  const start = new Date(startDate + 'T00:00:00Z');
  const cur = new Date(isoDate + 'T00:00:00Z');
  return Math.floor((cur - start) / 86400000) + 1;
}

async function computeProgress(db, tracker) {
  const tz = tracker.timezone || 'Europe/Moscow';
  const todayIso = localDateInTz(tz);
  const rawToday = Math.max(1, dayNumberFor(tracker.start_date, todayIso));
  const entriesSnap = await db.collection('trackers').doc(tracker.id).collection('entries').get();
  let doneCount = 0;
  const entryByDay = {};
  entriesSnap.forEach(d => {
    const e = d.data();
    entryByDay[e.day_number] = e;
    if (e.done) doneCount++;
  });
  const missedSoFar = Math.max(0, (rawToday - 1) - doneCount);
  const totalSlots = Math.max(tracker.target_days + missedSoFar, rawToday);
  const remaining = Math.max(0, tracker.target_days - doneCount);
  return { rawToday, doneCount, totalSlots, remaining, entryByDay, todayIso };
}

module.exports = { initDb, tg, sendMessage, dayNumberFor, localDateInTz, localHourInTz, computeProgress, SITE_URL };
