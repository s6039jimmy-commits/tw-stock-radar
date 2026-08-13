import cron from 'node-cron';
import { MONITOR_SCAN_INTERVAL_MIN, NEWS_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen } from '../utils/helpers.js';
import { getActivePositions } from '../db/database.js';
import { evaluatePosition, evaluatePositionNewsOnly } from '../services/monitor/exitEngine.js';
import { connect, disconnect } from '../services/fugle/streaming.js';
import { logger } from '../utils/logger.js';

export const runPriceCheck = async () => {
  const positions = getActivePositions();
  for (const p of positions) {
    await evaluatePosition(p);
  }
};

export const runNewsCheck = async () => {
  // 盤中新聞檢查，已在 evaluatePosition 中涵蓋
};

// 盤前專用掃描：針對所有庫存，檢查是否有突發利空
export const runPreMarketNewsCheck = async () => {
  logger.info('Scheduler', '開始執行盤前新聞預警掃描...');
  const positions = getActivePositions();
  for (const p of positions) {
    await evaluatePositionNewsOnly(p);
  }
};

export const startStreaming = () => connect();
export const stopStreaming = () => disconnect();

export const startMonitorJobs = () => {
  cron.schedule(`*/${MONITOR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) runPriceCheck();
  });

  // 每日早上 08:45 執行盤前新聞預警
  cron.schedule('45 8 * * 1-5', runPreMarketNewsCheck);

  cron.schedule('0 9 * * 1-5', startStreaming);
  cron.schedule('35 13 * * 1-5', stopStreaming);
};
