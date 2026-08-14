import { Router } from 'express';
import { getTradeHistory, getTradeStats } from '../db/database.js';

const router = Router();

router.get('/trades', async (req, res) => {
  res.json({ success: true, data: await getTradeHistory() });
});

router.get('/stats', async (req, res) => {
  res.json({ success: true, data: await getTradeStats() });
});

export default router;
