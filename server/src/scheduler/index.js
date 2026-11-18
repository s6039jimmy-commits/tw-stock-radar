import { startRadarJobs } from './radarJob.js';
import { startMonitorJobs } from './monitorJob.js';
import { initTickMonitor } from '../services/monitor/tickMonitor.js';
import { logger } from '../utils/logger.js';

export const startAllJobs = () => {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    logger.info('Scheduler', '⚠️ 本機環境已停用排程推播 (避免與 Render 雲端推播衝突)');
    return;
  }
  startRadarJobs();
  startMonitorJobs();
  initTickMonitor();
  logger.info('Scheduler', '所有排程任務已啟動');
};

export const stopAllJobs = () => {
  logger.info('Scheduler', '所有排程任務已停止');
};
