import { Router } from 'express';
import { getSetting, setSetting } from '../db/database.js';
import { sendTestMessage } from '../services/notify/telegram.js';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      FUGLE_API_KEY: process.env.FUGLE_API_KEY || getSetting('FUGLE_API_KEY', ''),
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || getSetting('GEMINI_API_KEY', ''),
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || getSetting('TELEGRAM_BOT_TOKEN', ''),
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || getSetting('TELEGRAM_CHAT_ID', ''),
      STOP_LOSS_PCT: getSetting('STOP_LOSS_PCT', '-7.0'),
      TAKE_PROFIT_PCT: getSetting('TAKE_PROFIT_PCT', '15.0'),
      VOLUME_RATIO_THRESHOLD: getSetting('VOLUME_RATIO_THRESHOLD', '2.5')
    }
  });
});

router.put('/', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    process.env[key] = String(value);
    setSetting(key, String(value));
  }
  res.json({ success: true, message: '設定已更新' });
});

router.post('/test-telegram', async (req, res) => {
  const { botToken, chatId } = req.body;
  const result = await sendTestMessage(botToken, chatId);
  res.json(result);
});

export default router;
