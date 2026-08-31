const { initDb, tg, sendMessage, setBotCommands, computeProgress, PROGRESS_BUTTON_TEXT } = require('./common');

function statusText(tracker, p) {
  return `«${tracker.title}»\n\n` +
    `День ${p.rawToday} из ${p.totalSlots}\n` +
    `Сделано: ${p.doneCount}/${tracker.target_days}\n` +
    `Осталось: ${p.remaining} дней\n` +
    `Финиш (прогноз): ${p.finishDate}`;
}

async function main() {
  const db = initDb();
  await setBotCommands();

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
      const username = msg.from && msg.from.username ? msg.from.username : null;
      const firstName = msg.from && msg.from.first_name ? msg.from.first_name : null;

      if (!trackerId) {
        const q = await db.collection('trackers').where('telegram_chat_id', '==', chatId).get();
        if (!q.empty) {
          const already = q.docs[0].data();
          await sendMessage(chatId, `✅ Вы уже подключены к трекеру «${already.title}» — напоминания приходят.`, { persistentKeyboard: true });
        } else {
          await sendMessage(chatId, 'Чтобы подключить напоминания, открой свой трекер и нажми там кнопку «Подключить Telegram» — она сама пришлёт сюда правильную ссылку.');
        }
        continue;
      }
      const trackerSnap = await db.collection('trackers').doc(trackerId).get();
      if (!trackerSnap.exists) {
        await sendMessage(chatId, 'Не нашёл такой трекер — проверь, что перешёл по ссылке из своего приложения.');
        continue;
      }
      const alreadyConnected = trackerSnap.data().telegram_chat_id === chatId;
      await db.collection('trackers').doc(trackerId).update({ telegram_chat_id: chatId, telegram_username: username, telegram_first_name: firstName });
      if (alreadyConnected) {
        await sendMessage(chatId, `✅ Вы уже подключены к трекеру «${trackerSnap.data().title}» — напоминания приходят.`, { persistentKeyboard: true });
      } else {
        await sendMessage(
          chatId,
          '✅ Готово! Раз в день, в 17:00 по твоему времени, буду присылать напоминание — чтобы дни челленджа реже пропускались.',
          { persistentKeyboard: true }
        );
      }
      continue;
    }

    if (text === '/status' || text === PROGRESS_BUTTON_TEXT) {
      const q = await db.collection('trackers').where('telegram_chat_id', '==', chatId).get();
      if (q.empty) {
        await sendMessage(chatId, 'Трекер ещё не подключён — открой свою ссылку трекера и нажми «Подключить Telegram».');
        continue;
      }
      for (const doc of q.docs) {
        const tracker = { id: doc.id, ...doc.data() };
        const p = await computeProgress(db, tracker);
        await sendMessage(chatId, statusText(tracker, p), { trackerId: tracker.id });
      }
      continue;
    }

    await sendMessage(chatId, '👋 Привет! Я бот-напоминалка для трекера челленджа. Чтобы меня подключить — открой свой трекер и нажми там кнопку «Подключить Telegram».');
  }

  if (maxId !== lastUpdateId) {
    await stateRef.set({ lastUpdateId: maxId }, { merge: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
