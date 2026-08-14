import cron from 'node-cron';
import { MONITOR_SCAN_INTERVAL_MIN, NEWS_SCAN_INTERVAL_MIN, PRE_MARKET_SCAN_TIME } from '../config/index.js';
import { isMarketOpen } from '../utils/helpers.js';
import { getActivePositions, getSetting } from '../db/database.js';
import { evaluatePosition, evaluatePositionNewsOnly } from '../services/monitor/exitEngine.js';
import { connect, disconnect } from '../services/fugle/streaming.js';
import { logger } from '../utils/logger.js';

export const runPriceCheck = async () => {
  const positions = await getActivePositions();
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
  const positions = await getActivePositions();
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

  // 動態檢查盤前預警時間 (每分鐘檢查一次)
  cron.schedule('* * * * 1-5', async () => {
    const timeStr = await getSetting('PRE_MARKET_SCAN_TIME') || PRE_MARKET_SCAN_TIME || '08:45';
    const [hh, mm] = timeStr.split(':');
    const now = new Date();
    
    // 將當前時間轉換為台北時區
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = formatter.formatToParts(now);
    const currentHH = parts.find(p => p.type === 'hour').value;
    const currentMM = parts.find(p => p.type === 'minute').value;
    
    if (currentHH === hh && currentMM === mm) {
      runPreMarketNewsCheck();
    }
  });

  cron.schedule('0 9 * * 1-5', startStreaming);
  cron.schedule('35 13 * * 1-5', stopStreaming);
};
