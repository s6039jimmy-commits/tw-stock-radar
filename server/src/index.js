import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { PORT } from './config/index.js';
import { initDatabase, saveDatabase } from './db/database.js';
import apiRoutes from './api/routes.js';
import { startAllJobs, stopAllJobs } from './scheduler/index.js';
import { initTelegramBot } from './services/notify/telegram.js';
import { logger } from './utils/logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// 廣播訊息給所有 WebSocket 客戶端
export const broadcast = (type, data) => {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
};

// 主啟動函式
const start = async () => {
  try {
    // 初始化資料庫 (async with sql.js)
    await initDatabase();

    // 初始化 Telegram Bot
    initTelegramBot();

    // 掛載 API 路由
    app.use('/api', apiRoutes);

    // 健康檢查端點
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // WebSocket 連線管理
    wss.on('connection', (ws) => {
      logger.info('WebSocket', '前端客戶端已連接');

      ws.on('message', (msg) => {
        try {
          const parsed = JSON.parse(msg);
          logger.debug('WebSocket', `收到訊息: ${parsed.type}`);
        } catch (e) {
          // 忽略非 JSON 訊息
        }
      });

      ws.on('close', () => {
        logger.info('WebSocket', '前端客戶端已斷開');
      });

      // 發送歡迎訊息
      ws.send(JSON.stringify({
        type: 'system:status',
        data: { status: 'connected', serverTime: new Date().toISOString() }
      }));
    });

    // 啟動排程引擎
    startAllJobs(broadcast);

    // 啟動伺服器
    server.listen(PORT, () => {
      logger.info('Server', `🚀 AI 台股策略雷達系統已啟動`);
      logger.info('Server', `📡 API 伺服器: http://localhost:${PORT}`);
      logger.info('Server', `🔌 WebSocket: ws://localhost:${PORT}`);
    });

  } catch (error) {
    logger.error('Server', '伺服器啟動失敗', error);
    process.exit(1);
  }
};

// 優雅關閉
const shutdown = () => {
  logger.info('Server', '正在優雅關閉伺服器...');
  stopAllJobs();
  saveDatabase();
  server.close(() => {
    logger.info('Server', '伺服器已關閉');
    process.exit(0);
  });
  // 若 3 秒內未關閉，強制退出
  setTimeout(() => process.exit(1), 3000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
