import cron from 'node-cron';
import { RADAR_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen, isTradingDay } from '../utils/helpers.js';
import { scan as scanBlueChip } from '../services/radar/blueChipScanner.js';
import { scan as scanMomentum } from '../services/radar/momentumScanner.js';
import { scan as scanCustom } from '../services/radar/customScanner.js';
import { scanNightSession } from '../services/radar/nightScanner.js';
import { runPreMarketScan } from '../services/radar/preMarketScanner.js';
import { runPostMarketScan } from '../services/radar/postMarketScanner.js';
import { runMiddayScan } from '../services/radar/middayScanner.js';
import { getTradeStats } from '../db/database.js';
import { sendDailySummary } from '../services/notify/telegram.js';
import { logger } from '../utils/logger.js';

export const runBlueChipScan = async () => {
  await scanBlueChip();
};

export const runMomentumScan = async () => {
  await scanMomentum();
};

export const runCustomScan = async () => {
  logger.info('Scheduler', '🔍 啟動 08:30 使用者專屬選股雷達...');
  try {
    await scanCustom();
  } catch (e) {
    logger.error('Scheduler', '專屬選股雷達失敗', e.message);
  }
};

export { runPreMarketScan };

export const runNightScan = async () => {
  await scanNightSession();
};

import { fetchLatestStockNews } from '../services/news/cnyesNews.js';
import { generateMarketSummaryText } from '../services/ai/geminiClient.js';

export const runPostMarketSummary = async () => {
  logger.info('Scheduler', '執行盤後統計總結...');
  try {
    const stats = await getTradeStats();
    
    // 取得今日市場總結
    const news = await fetchLatestStockNews(15);
    const marketSummary = await generateMarketSummaryText(news);
    
    await sendDailySummary(stats, marketSummary);
  } catch (e) {
    logger.error('Scheduler', '發送盤後總結失敗', e);
  }
};

export const runPostMarketStockScan = async () => {
  logger.info('Scheduler', '執行盤後選股掃描...');
  try {
    await runPostMarketScan();
  } catch (e) {
    logger.error('Scheduler', '盤後選股失敗', e);
  }
};

export const startRadarJobs = () => {
  const options = { timezone: 'Asia/Taipei' };

  // 盤中定期掃描（依使用者指示：已關閉爆量飆股推播）
  cron.schedule(`*/${RADAR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) {
      runBlueChipScan();
      // runMomentumScan(); // 已關閉：不推播爆量飆股
    }
  }, options);
  
  // 夜盤掃描 (22:30, 01:30, 05:30) — 依使用者指示全面關閉：半夜不打擾，美股節日放假絕不推播
  // cron.schedule('30 22,1,5 * * 1-5', runNightScan, options);
  
  // ☀️ 08:40 盤前試撮與開盤預估（一天只發一次）：大白話漲跌預判、外盤 ADR 連動、原因好懂秒懂
  cron.schedule('40 8 * * 1-5', () => {
    if (isTradingDay()) {
      runPreMarketScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 08:40 盤前快報');
    }
  }, options);
  
  // 依使用者指示：取消 14:00 統計推播（不要勝率、不要風控廢話）
  // cron.schedule('0 14 * * 1-5', runPostMarketSummary, options);

  // 🍱 選擇 B：11:30 午盤快報（一天只發一次）：大盤上午戰況、預估成交量、權值強弱、大戶偷拉偷殺
  cron.schedule('30 11 * * 1-5', () => {
    if (isTradingDay()) {
      runMiddayScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 11:30 午盤快報');
    }
  }, options);

  // 🎯 14:05 唯一盤後推播：大盤指數明日漲跌預測（僅在正常交易日發送，連假休市絕不推播）
  cron.schedule('5 14 * * 1-5', () => {
    if (isTradingDay()) {
      runPostMarketStockScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 14:05 大盤推播');
    }
  }, options);

  logger.info('Scheduler', '✅ 所有排程已啟動 (台北時間)');
};
