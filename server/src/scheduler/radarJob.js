import cron from 'node-cron';
import { RADAR_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen } from '../utils/helpers.js';
import { scan as scanBlueChip } from '../services/radar/blueChipScanner.js';
import { scan as scanMomentum } from '../services/radar/momentumScanner.js';
import { addRadarSignal } from '../db/database.js';
import { sendEntrySignal } from '../services/notify/telegram.js';
import { logger } from '../utils/logger.js';

export const runBlueChipScan = async () => {
  await scanBlueChip();
};

export const runMomentumScan = async () => {
  await scanMomentum();
};

export const runPreMarketScan = async () => {
  logger.info('Scheduler', '執行盤前新聞掃描...');
  await runBlueChipScan();
};

export const runPostMarketSummary = async () => {
  logger.info('Scheduler', '執行盤後統計總結...');
};

export const startRadarJobs = () => {
  // 盤中定期掃描
  cron.schedule(`*/${RADAR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) {
      runBlueChipScan();
      runMomentumScan();
    }
  });
  
  // 盤前 (08:30)
  cron.schedule('30 8 * * 1-5', runPreMarketScan);
  // 盤後 (14:00)
  cron.schedule('0 14 * * 1-5', runPostMarketSummary);
};
