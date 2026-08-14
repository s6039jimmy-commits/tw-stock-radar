import cron from 'node-cron';
import { RADAR_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen } from '../utils/helpers.js';
import { scan as scanBlueChip } from '../services/radar/blueChipScanner.js';
import { scan as scanMomentum } from '../services/radar/momentumScanner.js';
import { scanNightSession } from '../services/radar/nightScanner.js';
import { generatePreMarketReport } from '../services/radar/preMarketScanner.js';
import { getTradeStats } from '../db/database.js';
import { sendDailySummary } from '../services/notify/telegram.js';
import { logger } from '../utils/logger.js';

export const runBlueChipScan = async () => {
  await scanBlueChip();
};

export const runMomentumScan = async () => {
  await scanMomentum();
};

export const runPreMarketScan = async () => {
  await generatePreMarketReport();
};

export const runNightScan = async () => {
  await scanNightSession();
};

export const runPostMarketSummary = async () => {
  logger.info('Scheduler', '執行盤後統計總結...');
  try {
    const stats = getTradeStats();
    await sendDailySummary(stats);
  } catch (e) {
    logger.error('Scheduler', '發送盤後總結失敗', e);
  }
};

export const startRadarJobs = () => {
  const options = { timezone: 'Asia/Taipei' };

  // 盤中定期掃描
  cron.schedule(`*/${RADAR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) {
      runBlueChipScan();
      runMomentumScan();
    }
  }, options);
  
  // 夜盤掃描 (15:00 到 05:00，每 15 分鐘一次)
  cron.schedule('*/15 15-23,0-5 * * 1-5', runNightScan, options);
  
  // 盤前早報 (08:30)
  cron.schedule('30 8 * * 1-5', runPreMarketScan, options);
  
  // 盤後總結 (14:00)
  cron.schedule('0 14 * * 1-5', runPostMarketSummary, options);
};
