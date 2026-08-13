import { Router } from 'express';
import { getActivePositions, addPosition, updatePosition, exitPosition, getExitAlerts } from '../db/database.js';

const router = Router();

router.get('/positions', (req, res) => {
  res.json({ success: true, data: getActivePositions() });
});

router.post('/positions', (req, res) => {
  const data = req.body;
  const result = addPosition(data);
  res.json({ success: true, id: result.lastInsertRowid });
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
