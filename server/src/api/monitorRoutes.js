import { Router } from 'express';
import { getActivePositions, addPosition, updatePosition, exitPosition, getExitAlerts } from '../db/database.js';
import { getQuote } from '../services/fugle/marketData.js';

const router = Router();

router.get('/positions', async (req, res) => {
  const positions = await getActivePositions();
  
  // 即時抓取每檔持股的當前報價，填入 current_price
  const enriched = await Promise.all(positions.map(async (pos) => {
    try {
      const quote = await getQuote(pos.symbol);
      const currentPrice = quote?.lastPrice || quote?.closePrice || pos.entry_price;
      return { ...pos, current_price: currentPrice };
    } catch (e) {
      return { ...pos, current_price: pos.entry_price };
    }
  }));

  res.json({ success: true, data: enriched });
});

import { evaluatePosition, evaluatePositionNewsOnly } from '../services/monitor/exitEngine.js';
import { isMarketOpen } from '../utils/helpers.js';

router.post('/positions', async (req, res) => {
  const data = req.body;
  const result = await addPosition(data);
  const newId = result.lastInsertRowid;

  // 新增持倉後立刻觸發健康檢查（背景非同步執行）
  setTimeout(async () => {
    try {
      const positions = await getActivePositions();
      const pos = positions.find(p => p.id === newId);
      if (pos) {
        if (isMarketOpen()) {
          await evaluatePosition(pos);
        } else {
          await evaluatePositionNewsOnly(pos);
        }
      }
    } catch (e) {
      console.error('Immediate check failed:', e);
    }
  }, 500);

  res.json({ success: true, id: newId });
});

router.patch('/positions/:id', async (req, res) => {
  await updatePosition(req.params.id, req.body);
  res.json({ success: true });
});

router.post('/positions/:id/exit', async (req, res) => {
  await exitPosition(req.params.id, req.body);
  res.json({ success: true });
});

router.get('/alerts', async (req, res) => {
  res.json({ success: true, data: await getExitAlerts() });
});

export default router;
