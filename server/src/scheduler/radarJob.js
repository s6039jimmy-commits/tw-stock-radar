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

export { runPreMarketScan, runOpenMarketScan, runMiddayScan };

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
    return await runPostMarketScan();
  } catch (e) {
    logger.error('Scheduler', '盤後選股失敗', e);
    return false;
  }
};

let isPreMarketRunning = false;
let isPostMarketRunning = false;

export const startRadarJobs = () => {
  const options = { timezone: 'Asia/Taipei' };

  // 盤中定期掃描（依使用者指示：已關閉爆量飆股推播）
  cron.schedule(`*/${RADAR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) {
      runBlueChipScan();
      // runMomentumScan(); // 已關閉：不推播爆量飆股
    }
  }, options);
  
  // 🌙 夜盤監控（已依指示停用主動推播以節省免費額度）
  // cron.schedule('*/15 21,22,23,0,1,2,3,4,5 * * *', () => {
  //   scanNightSession();
  // }, options);
  
  // ☀️ 08:40 盤前試撮與開盤預估（一天只發一次）：大白話漲跌預判、外盤 ADR 連動、原因好懂秒懂
  cron.schedule('40 8 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      const sent = await getSetting(`SENT_PRE_MARKET_${todayDate}`);
      if (sent || isPreMarketRunning) {
        logger.info('Scheduler', '今日 08:40 盤前快報已發送或正在執行中，跳過重複觸發');
        return;
      }
      isPreMarketRunning = true;
      await setSetting(`SENT_PRE_MARKET_${todayDate}`, 'SENDING');
      try {
        const ok = await runPreMarketScan();
        if (ok) {
          await setSetting(`SENT_PRE_MARKET_${todayDate}`, '1');
        } else {
          await setSetting(`SENT_PRE_MARKET_${todayDate}`, '');
        }
      } catch (err) {
        logger.error('Scheduler', '08:40 盤前推播異常', err);
        await setSetting(`SENT_PRE_MARKET_${todayDate}`, '');
      } finally {
        isPreMarketRunning = false;
      }
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳過 08:40 盤前快報');
    }
  }, options);

  // 🔔 09:01 一開盤戰況速報（已依指示停用主動推播，改由使用者在群組 @財神熊 查詢以節省免費額度）
  // cron.schedule('1 9 * * 1-5', async () => { ... });
  
  // 🍱 12:00 午盤快報（已依指示停用主動推播，改由使用者在群組 @財神熊 查詢以節省免費額度）
  // cron.schedule('0 12 * * 1-5', async () => { ... });

  // 🎯 14:05 唯一盤後推播：大盤指數明日漲跌預測（僅在正常交易日發送，連假休市絕不推播）
  cron.schedule('5 14 * * 1-5', async () => {
    if (isTradingDay()) {
      const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
      const sent = await getSetting(`SENT_POST_MARKET_${todayDate}`);
      if (sent || isPostMarketRunning) {
        logger.info('Scheduler', '今日 14:05 盤後快報已發送或正在執行中，跳過重複觸發');
        return;
      }
      isPostMarketRunning = true;
      await setSetting(`SENT_POST_MARKET_${todayDate}`, 'SENDING');
      try {
        const ok = await runPostMarketStockScan();
        if (ok) {
          await setSetting(`SENT_POST_MARKET_${todayDate}`, '1');
        } else {
          await setSetting(`SENT_POST_MARKET_${todayDate}`, '');
        }
      } catch (err) {
        logger.error('Scheduler', '14:05 盤後推播異常', err);
        await setSetting(`SENT_POST_MARKET_${todayDate}`, '');
      } finally {
        isPostMarketRunning = false;
      }
    } else {
      logger.info('Scheduler', '今日為台股休市日／連假，跳过 14:05 大盤推播');
    }
  }, options);

  // 🛡️ 智慧開機補發檢查：避開整點，僅在錯過時間後才啟動補發（防與正排程在同一分鐘併發重覆送出）
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

      // 1. 08:40 盤前補發：僅在 08:42 ~ 09:01 間檢查（延後 2 分鐘，確保 08:40 正排程完成而不重疊）
      if (totalMinutes >= 8 * 60 + 42 && totalMinutes <= 9 * 60 + 1) {
        const sent = await getSetting(`SENT_PRE_MARKET_${todayDate}`);
        if (!sent && !isPreMarketRunning) {
          logger.info('Scheduler', '🔄 檢測到處於 08:40 補發區間且尚未發送，自動補發盤前快報...');
          isPreMarketRunning = true;
          await setSetting(`SENT_PRE_MARKET_${todayDate}`, 'SENDING');
          try {
            const ok = await runPreMarketScan();
            if (ok) {
              await setSetting(`SENT_PRE_MARKET_${todayDate}`, '1');
            } else {
              await setSetting(`SENT_PRE_MARKET_${todayDate}`, '');
            }
          } catch (err) {
            logger.error('Scheduler', '補發 08:40 異常', err);
            await setSetting(`SENT_PRE_MARKET_${todayDate}`, '');
          } finally {
            isPreMarketRunning = false;
          }
        }
      }

      // 4. 14:05 盤後補發：僅在 14:07 ~ 15:00 間檢查（延後 2 分鐘，確保 14:05 正排程完成而不重疊）
      if (totalMinutes >= 14 * 60 + 7 && totalMinutes <= 15 * 60) {
        const sent = await getSetting(`SENT_POST_MARKET_${todayDate}`);
        if (!sent && !isPostMarketRunning) {
          logger.info('Scheduler', '🔄 檢測到處於 14:05 補發區間且尚未發送，自動補發盤後快報...');
          isPostMarketRunning = true;
          await setSetting(`SENT_POST_MARKET_${todayDate}`, 'SENDING');
          try {
            const ok = await runPostMarketStockScan();
            if (ok) {
              await setSetting(`SENT_POST_MARKET_${todayDate}`, '1');
            } else {
              await setSetting(`SENT_POST_MARKET_${todayDate}`, '');
            }
          } catch (err) {
            logger.error('Scheduler', '補發 14:05 異常', err);
            await setSetting(`SENT_POST_MARKET_${todayDate}`, '');
          } finally {
            isPostMarketRunning = false;
          }
        }
      }
    } catch (e) {
      logger.warn('Scheduler', '智慧補發檢查異常: ' + e.message);
    }
  };

  // 開機立刻執行一次補發檢查
  runCatchupChecks();

  // 🛡️ 智慧補發巡檢：每 1 分鐘定期巡檢是否有漏發的定時快報（防伺服器短暫凍結或休眠甦醒後錯過整點）
  cron.schedule('* * * * *', () => {
    runCatchupChecks();
  }, options);

  logger.info('Scheduler', '✅ 所有排程已啟動 (台北時間)');
};
