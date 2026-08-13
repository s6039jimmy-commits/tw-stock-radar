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

router.get('/health', (req, res) => res.json({ status: 'OK' }));

export default router;
