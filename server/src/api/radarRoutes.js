import { Router } from 'express';
import { getRadarSignals } from '../db/database.js';
import { runBlueChipScan, runMomentumScan, runCustomScan, runMiddayScan, runPostMarketStockScan } from '../scheduler/radarJob.js';

const router = Router();

router.post('/trigger-midday', async (req, res) => {
  const ok = await runMiddayScan(true);
  res.json({ success: ok, message: 'Midday report triggered' });
});

router.post('/trigger-postmarket', async (req, res) => {
  const ok = await runPostMarketStockScan();
  res.json({ success: ok, message: 'Post-market report triggered' });
});

router.get('/signals', async (req, res) => {
  const type = req.query.type;
  let signals = await getRadarSignals();
  if (type) signals = signals.filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.get('/signals/:type', async (req, res) => {
  const type = req.params.type;
  const signals = await getRadarSignals().filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.post('/scan', async (req, res) => {
  const { type } = req.body;
  // 異步執行，不阻塞 HTTP 回應
  if (type === 'blue_chip' || type === 'all') runBlueChipScan().catch(e => console.error(e));
  if (type === 'momentum' || type === 'all') runMomentumScan().catch(e => console.error(e));
  if (type === 'custom' || type === 'all') runCustomScan().catch(e => console.error(e));
  res.json({ success: true, message: 'Scan triggered in background' });
});

export default router;
