import yahooFinance from 'yahoo-finance2';
import { logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

// 快取目錄
const CACHE_DIR = './data/cache';

/**
 * 下載並快取歷史 K 線資料
 * @param {string} symbol - 台股代號 (自動轉為 .TW 或 .TWO)
 * @param {number} years - 要抓幾年的資料
 */
export const getHistoricalData = async (symbol, years = 3) => {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheFile = path.join(CACHE_DIR, `${symbol}_${years}y.json`);
  
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    const mtime = new Date(stats.mtime);
    const today = new Date();
    if (mtime.toDateString() === today.toDateString()) {
      logger.info('Backtest Data', `使用快取的歷史資料: ${symbol}`);
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    }
  }

  try {
    logger.info('Backtest Data', `開始下載 ${symbol} 歷史資料 (${years}年)...`);
    const yf = new yahooFinance();
    const endDate = new Date().toISOString().split('T')[0];
    const startDateObj = new Date();
    startDateObj.setFullYear(startDateObj.getFullYear() - years);
    const startDate = startDateObj.toISOString().split('T')[0];

    let results = [];
    try {
      const res = await yf.chart(`${symbol}.TW`, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });
      results = res.quotes || [];
    } catch (e) {
      const res = await yf.chart(`${symbol}.TWO`, {
        period1: startDate,
        period2: endDate,
        interval: '1d'
      });
      results = res.quotes || [];
    }

    if (results && results.length > 0) {
      const formatted = results.map(r => ({
        date: new Date(r.date).toISOString().split('T')[0],
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume
      }));

      fs.writeFileSync(cacheFile, JSON.stringify(formatted));
      return formatted;
    }
    return [];
  } catch (error) {
    logger.error('Backtest Data', `下載 ${symbol} 歷史資料失敗`, error);
    return [];
  }
};
