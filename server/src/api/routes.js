import { Router } from 'express';
import radarRoutes from './radarRoutes.js';
import monitorRoutes from './monitorRoutes.js';
import historyRoutes from './historyRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import chatRoutes from './chatRoutes.js';
import { getQuote } from '../services/fugle/marketData.js';

const router = Router();

router.use('/radar', radarRoutes);
router.use('/monitor', monitorRoutes);
router.use('/history', historyRoutes);
router.use('/settings', settingsRoutes);
router.use('/ai', chatRoutes);

router.get('/market/quote/:symbol', async (req, res) => {
  const quote = await getQuote(req.params.symbol);
  res.json({ success: !!quote, data: quote });
});

import { handleLineWebhookEvent } from '../services/notify/lineReply.js';

router.post('/line/webhook', async (req, res) => {
  res.status(200).send('OK');
  const events = req.body?.events || [];
  for (const event of events) {
    try {
      await handleLineWebhookEvent(event);
    } catch (e) {
      console.error('處理 LINE Webhook 事件失敗:', e);
    }
  }
});

router.get('/health', (req, res) => res.json({ status: 'OK' }));

export default router;
