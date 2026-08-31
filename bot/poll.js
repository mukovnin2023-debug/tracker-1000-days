const { initDb, tg, sendMessage, computeProgress, SITE_URL } = require('./common');

async function main() {
  const db = initDb();
  const stateRef = db.collection('bot_state').doc('telegram');
  const stateSnap = await stateRef.get();
  const lastUpdateId = stateSnap.exists ? (stateSnap.data().lastUpdateId || 0) : 0;

  const res = await tg('getUpdates', { offset: lastUpdateId + 1, timeout: 0 });
  const updates = res.result || [];
  let maxId = lastUpdateId;

  for (const update of updates) {
    if (update.update_id > maxId) maxId = update.update_id;
    const msg = update.message;
    if (!msg || !msg.text) continue;
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const trackerId = parts[1];
      if (!trackerId) {
        await sendMessage(chatId, 'Чтобы подключить напоминания, откройте свой трекер и нажмите кнопку «Подключить Telegram» — она сама пришлёт сюда правильную ссылку.');
        continue;
      }
      const trackerSnap = await db.collection('trackers').doc(trackerId).get();
      if (!trackerSnap.exists) {
        await sendMessage(chatId, 'Не нашёл такой трекер — проверьте, что перешли по ссылке из своего приложения.');
        continue;
      }
      await db.collection('trackers').doc(trackerId).update({ telegram_chat_id: chatId });
      const t = trackerSnap.data();
      await sendMessage(chatId, `Готово! Буду напоминать про «${t.title}» раз в день в 18:00 по Москве, если день ещё не заполнен. Команда /status покажет текущий прогресс в любой момент.`);
      continue;
    }

    if (text === '/status') {
      const q = await db.collection('trackers').where('telegram_chat_id', '==', chatId).get();
      if (q.empty) {
        await sendMessage(chatId, 'Трекер ещё не подключён — откройте свою ссылку трекера и нажмите «Подключить Telegram».');
        continue;
      }
      for (const doc of q.docs) {
        const tracker = { id: doc.id, ...doc.data() };
        const p = await computeProgress(db, tracker);
        const finishNote = p.remaining <= 0
          ? 'челлендж пройден 🎉'
          : `осталось ${p.remaining} дней`;
        await sendMessage(chatId,
          `«${tracker.title}»\nдень ${p.rawToday} из ${p.totalSlots}\nсделано: ${p.doneCount}/${tracker.target_days}\n${finishNote}\n\n${SITE_URL}?id=${tracker.id}`
        );
      }
      continue;
    }

    await sendMessage(chatId, 'Команды: /status — показать прогресс. Чтобы подключить трекер — перейдите по ссылке «Подключить Telegram» из самого приложения.');
  }

  if (maxId !== lastUpdateId) {
    await stateRef.set({ lastUpdateId: maxId }, { merge: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
