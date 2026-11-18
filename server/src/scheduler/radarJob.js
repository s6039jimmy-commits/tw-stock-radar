import cron from 'node-cron';
import { RADAR_SCAN_INTERVAL_MIN } from '../config/index.js';
import { isMarketOpen, isTradingDay } from '../utils/helpers.js';
import { scan as scanBlueChip } from '../services/radar/blueChipScanner.js';
import { scan as scanMomentum } from '../services/radar/momentumScanner.js';
import { scan as scanCustom } from '../services/radar/customScanner.js';
import { scanNightSession } from '../services/radar/nightScanner.js';
import { runPreMarketScan } from '../services/radar/preMarketScanner.js';
import { runOpenMarketScan } from '../services/radar/openMarketScanner.js';
import { runPostMarketScan } from '../services/radar/postMarketScanner.js';
import { runMiddayScan } from '../services/radar/middayScanner.js';
import { getTradeStats, getSetting, setSetting } from '../db/database.js';
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

export { runPreMarketScan, runOpenMarketScan };

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
  
  // 🌙 半夜夜盤監控：美股盤中每 15 分鐘巡檢，若 EWT 跌幅 ≥ 1% 立即通知（整晚只報一次，防擾眠不洗版）
  cron.schedule('*/15 21,22,23,0,1,2,3,4 * * *', () => {
    scanNightSession();
  }, options);
  
  // ☀️ 08:40 盤前試撮與開盤預估（一天只發一次）：大白話漲跌預判、外盤 ADR 連動、原因好懂秒懂
  cron.schedule('40 8 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      await setSetting(`SENT_PRE_MARKET_${todayDate}`, '1');
      runPreMarketScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 08:40 盤前快報');
    }
  }, options);

  // 🔔 09:01 一開盤戰況速報（台股 09:00 開盤撮合完成後第一時間推播，涵蓋加權指數、0056、006208、台積電）
  cron.schedule('1 9 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      await setSetting(`SENT_OPEN_MARKET_${todayDate}`, '1');
      runOpenMarketScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 09:01 開盤快報');
    }
  }, options);
  
  // 🍱 12:00 午盤快報（一天只發一次）：大盤上午戰況、預估成交量、權值強弱、大戶偷拉偷殺
  cron.schedule('0 12 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      await setSetting(`SENT_MIDDAY_${todayDate}`, '1');
      runMiddayScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 12:00 午盤快報');
    }
  }, options);

  // 🎯 14:05 唯一盤後推播：大盤指數明日漲跌預測（僅在正常交易日發送，連假休市絕不推播）
  cron.schedule('5 14 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      await setSetting(`SENT_POST_MARKET_${todayDate}`, '1');
      runPostMarketStockScan();
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳过 14:05 大盤推播');
    }
  }, options);

  // 🛡️ 智慧開機補發檢查：若伺服器重啟剛好卡在整點幾十秒而錯過整點觸發，自動補發
  const runCatchupChecks = async () => {
    try {
      if (!isTradingDay()) return;
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { 
        timeZone: 'Asia/Taipei', 
        hour: 'numeric', 
        minute: 'numeric', 
        hour12: false 
      }).formatToParts(now);
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      const totalMinutes = hour * 60 + minute;
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now);

      // 1. 08:40 盤前補發 (08:40 ~ 08:55 間重啟且未發送)
      if (totalMinutes >= 8 * 60 + 40 && totalMinutes <= 8 * 60 + 55) {
        const sent = await getSetting(`SENT_PRE_MARKET_${todayDate}`);
        if (!sent) {
          logger.info('Scheduler', '🔄 檢測到剛重啟處於 08:40 區間且尚未發送，自動補發盤前快報...');
          await setSetting(`SENT_PRE_MARKET_${todayDate}`, '1');
          await runPreMarketScan();
        }
      }

      // 2. 09:01 開盤補發 (09:01 ~ 09:20 間重啟且未發送)
      if (totalMinutes >= 9 * 60 + 1 && totalMinutes <= 9 * 60 + 20) {
        const sent = await getSetting(`SENT_OPEN_MARKET_${todayDate}`);
        if (!sent) {
          logger.info('Scheduler', '🔄 檢測到剛重啟處於 09:01 區間且尚未發送，自動補發開盤快報...');
          await setSetting(`SENT_OPEN_MARKET_${todayDate}`, '1');
          await runOpenMarketScan();
        }
      }

      // 3. 12:00 午盤補發 (12:00 ~ 12:20 間重啟且未發送)
      if (totalMinutes >= 12 * 60 && totalMinutes <= 12 * 60 + 20) {
        const sent = await getSetting(`SENT_MIDDAY_${todayDate}`);
        if (!sent) {
          logger.info('Scheduler', '🔄 檢測到剛重啟處於 12:00 區間且尚未發送，自動補發午盤快報...');
          await setSetting(`SENT_MIDDAY_${todayDate}`, '1');
          await runMiddayScan();
        }
      }

      // 4. 14:05 盤後補發 (14:05 ~ 14:30 間重啟且未發送)
      if (totalMinutes >= 14 * 60 + 5 && totalMinutes <= 14 * 60 + 30) {
        const sent = await getSetting(`SENT_POST_MARKET_${todayDate}`);
        if (!sent) {
          logger.info('Scheduler', '🔄 檢測到剛重啟處於 14:05 區間且尚未發送，自動補發盤後快報...');
          await setSetting(`SENT_POST_MARKET_${todayDate}`, '1');
          await runPostMarketStockScan();
        }
      }
    } catch (e) {
      logger.warn('Scheduler', '智慧補發檢查異常: ' + e.message);
    }
  };

  runCatchupChecks();

  logger.info('Scheduler', '✅ 所有排程已啟動 (台北時間)');
};
