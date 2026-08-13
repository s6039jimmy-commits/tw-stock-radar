import { Router } from 'express';
import { getRadarSignals } from '../db/database.js';
import { runBlueChipScan, runMomentumScan } from '../scheduler/radarJob.js';

const router = Router();

router.get('/signals', (req, res) => {
  const type = req.query.type;
  let signals = getRadarSignals();
  if (type) signals = signals.filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.get('/signals/:type', (req, res) => {
  const type = req.params.type;
  const signals = getRadarSignals().filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.post('/scan', async (req, res) => {
  const { type } = req.body;
  if (type === 'blue_chip' || type === 'all') await runBlueChipScan();
  if (type === 'momentum' || type === 'all') await runMomentumScan();
  res.json({ success: true, message: 'Scan triggered' });
});

export default router;
