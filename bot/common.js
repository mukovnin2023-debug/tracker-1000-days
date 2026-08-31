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

// Та же логика, что в app/index.html — день считается от start_date (местная дата),
// финиш растёт по факту пропусков.
function dayNumberFor(startDate, isoDate) {
  const start = new Date(startDate + 'T00:00:00Z');
  const cur = new Date(isoDate + 'T00:00:00Z');
  return Math.floor((cur - start) / 86400000) + 1;
}

function todayMskIso() {
  const mskNow = new Date(Date.now() + 3 * 3600 * 1000);
  return mskNow.toISOString().slice(0, 10);
}

async function computeProgress(db, tracker) {
  const rawToday = Math.max(1, dayNumberFor(tracker.start_date, todayMskIso()));
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
  return { rawToday, doneCount, totalSlots, remaining, entryByDay };
}

module.exports = { initDb, tg, sendMessage, dayNumberFor, todayMskIso, computeProgress, SITE_URL };
