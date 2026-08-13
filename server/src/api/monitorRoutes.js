import { Router } from 'express';
import { getActivePositions, addPosition, updatePosition, exitPosition, getExitAlerts } from '../db/database.js';

const router = Router();

router.get('/positions', (req, res) => {
  res.json({ success: true, data: getActivePositions() });
});

import { evaluatePosition, evaluatePositionNewsOnly } from '../services/monitor/exitEngine.js';
import { isMarketOpen } from '../utils/helpers.js';

router.post('/positions', (req, res) => {
  const data = req.body;
  const result = addPosition(data);
  const newId = result.lastInsertRowid;

  // 新增持倉後立刻觸發健康檢查（背景非同步執行）
  setTimeout(async () => {
    try {
      const positions = getActivePositions();
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

router.patch('/positions/:id', (req, res) => {
  updatePosition(req.params.id, req.body);
  res.json({ success: true });
});

router.post('/positions/:id/exit', (req, res) => {
  exitPosition(req.params.id, req.body);
  res.json({ success: true });
});

router.get('/alerts', (req, res) => {
  res.json({ success: true, data: getExitAlerts() });
});

export default router;
