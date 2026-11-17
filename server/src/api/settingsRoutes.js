import { Router } from 'express';
import { getSetting, setSetting } from '../db/database.js';
import { sendTestMessage } from '../services/notify/telegram.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({
    success: true,
    data: {
      FUGLE_API_KEY: process.env.FUGLE_API_KEY || await getSetting('FUGLE_API_KEY', ''),
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || await getSetting('GEMINI_API_KEY', ''),
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || await getSetting('TELEGRAM_BOT_TOKEN', ''),
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || await getSetting('TELEGRAM_CHAT_ID', ''),
      STOP_LOSS_PCT: await getSetting('STOP_LOSS_PCT', '-7.0'),
      TAKE_PROFIT_PCT: await getSetting('TAKE_PROFIT_PCT', '15.0'),
      VOLUME_RATIO_THRESHOLD: await getSetting('VOLUME_RATIO_THRESHOLD', '2.5')
    }
  });
});

router.put('/', async (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    process.env[key] = String(value);
    await setSetting(key, String(value));
  }
  res.json({ success: true, message: '設定已更新' });
});

router.post('/test-telegram', async (req, res) => {
  const { botToken, chatId } = req.body;
  const result = await sendTestMessage(botToken, chatId);
  res.json(result);
});

import { sendLineMessage } from '../services/notify/line.js';

router.post('/test-line', async (req, res) => {
  const msg = req.body?.message || '【Render 雲端驗證】這條訊息是由 Render 雲端伺服器發出的，證明即使關閉電腦，雲端機器人依然 24 小時正常運作！';
  const result = await sendLineMessage(msg);
  res.json({ success: result });
});

export default router;
