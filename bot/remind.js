const { initDb, sendMessage, computeProgress, SITE_URL } = require('./common');

async function main() {
  const db = initDb();
  const snap = await db.collection('trackers').get();

  for (const doc of snap.docs) {
    const tracker = { id: doc.id, ...doc.data() };
    if (!tracker.telegram_chat_id) continue;

    const p = await computeProgress(db, tracker);
    if (p.remaining <= 0) continue; // челлендж пройден — напоминания больше не нужны

    const todayEntry = p.entryByDay[p.rawToday];
    const doneToday = !!(todayEntry && todayEntry.done);

    const text = doneToday
      ? `День ${p.rawToday} по «${tracker.title}» отмечен ✅ Так держать — движение к цели идёт по плану!\n\n${SITE_URL}?id=${tracker.id}`
      : `Напоминание: день ${p.rawToday} из ${p.totalSlots} по «${tracker.title}» ещё не заполнен.\n«${tracker.checkbox_label}» — сделано сегодня?\n\n${SITE_URL}?id=${tracker.id}`;

    await sendMessage(tracker.telegram_chat_id, text);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
