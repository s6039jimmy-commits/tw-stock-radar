import { Router } from 'express';
import { getTradeHistory, getTradeStats } from '../db/database.js';

const router = Router();

router.get('/trades', (req, res) => {
  res.json({ success: true, data: getTradeHistory() });
});

router.get('/stats', (req, res) => {
  res.json({ success: true, data: getTradeStats() });
});

export default router;
