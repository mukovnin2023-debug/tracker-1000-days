const { initDb, sendMessage, computeProgress, localHourInTz } = require('./common');

const REMIND_HOUR = 17;

async function main() {
  const db = initDb();
  const snap = await db.collection('trackers').get();

  for (const doc of snap.docs) {
    const tracker = { id: doc.id, ...doc.data() };
    if (!tracker.telegram_chat_id) continue;

    const tz = tracker.timezone || 'Europe/Moscow';
    if (localHourInTz(tz) !== REMIND_HOUR) continue;

    const p = await computeProgress(db, tracker);
    if (p.remaining <= 0) continue; // челлендж пройден — напоминания больше не нужны
    if (tracker.last_reminder_sent_date === p.todayIso) continue; // уже отправляли сегодня (по его местному времени)

    const todayEntry = p.entryByDay[p.rawToday];
    const doneToday = !!(todayEntry && todayEntry.done);

    if (doneToday) {
      await sendMessage(
        tracker.telegram_chat_id,
        `✅ Так держать! Уже ${p.rawToday} день челленджа. Ты молодец!`,
        { trackerId: tracker.id, buttonText: 'Открыть трекер →' }
      );
    } else {
      await sendMessage(
        tracker.telegram_chat_id,
        `⏰ День ${p.rawToday} — сделал сегодня «${tracker.checkbox_label}»? Переходи в трекер и отмечай.`,
        { trackerId: tracker.id, buttonText: 'Заполнить трекер →' }
      );
    }

    await db.collection('trackers').doc(tracker.id).update({ last_reminder_sent_date: p.todayIso });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
