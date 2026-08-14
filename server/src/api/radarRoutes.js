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

router.post('/scan', (req, res) => {
  const { type } = req.body;
  // 異步執行，不阻塞 HTTP 回應
  if (type === 'blue_chip' || type === 'all') runBlueChipScan().catch(e => console.error(e));
  if (type === 'momentum' || type === 'all') runMomentumScan().catch(e => console.error(e));
  res.json({ success: true, message: 'Scan triggered in background' });
});

export default router;
