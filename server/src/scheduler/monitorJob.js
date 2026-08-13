import cron from 'node-cron';
import { MONITOR_SCAN_INTERVAL_MIN, NEWS_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen } from '../utils/helpers.js';
import { getActivePositions } from '../db/database.js';
import { evaluatePosition } from '../services/monitor/exitEngine.js';
import { connect, disconnect } from '../services/fugle/streaming.js';
import { logger } from '../utils/logger.js';

export const runPriceCheck = async () => {
  const positions = getActivePositions();
  for (const p of positions) {
    await evaluatePosition(p);
  }
};

export const runNewsCheck = async () => {
  // 新聞檢查
};

export const startStreaming = () => connect();
export const stopStreaming = () => disconnect();

export const startMonitorJobs = () => {
  cron.schedule(`*/${MONITOR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) runPriceCheck();
  });

  cron.schedule(`*/${NEWS_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) runNewsCheck();
  });

  cron.schedule('0 9 * * 1-5', startStreaming);
  cron.schedule('35 13 * * 1-5', stopStreaming);
};
