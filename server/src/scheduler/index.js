import { startRadarJobs } from './radarJob.js';
import { startMonitorJobs } from './monitorJob.js';
import { initTickMonitor } from '../services/monitor/tickMonitor.js';
import { logger } from '../utils/logger.js';

export const startAllJobs = () => {
  startRadarJobs();
  startMonitorJobs();
  initTickMonitor();
  logger.info('Scheduler', '所有排程任務已啟動');
};

export const stopAllJobs = () => {
  logger.info('Scheduler', '所有排程任務已停止');
};
