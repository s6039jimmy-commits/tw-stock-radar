import { Router } from 'express';
import { chatWithAdvisor } from '../services/ai/advisorChat.js';

const router = Router();

router.post('/chat', async (req, res) => {
  const { message, history, stockContext } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: '請輸入有效的對話訊息' });
  }

  const result = await chatWithAdvisor({ message, history, stockContext });
  res.json({ success: true, data: result });
});

export default router;
