import { MARKET_OPEN, MARKET_CLOSE } from '../config/index.js';
import fetch from 'node-fetch';
import { logger } from './logger.js';

// TWSE 官方公休日快取（同步預設 2026 年已知連假與國定假日，確保系統啟動第一秒即可準確辨識）
let holidayCache = new Set([
  '2026-01-01', // 元旦
  '2026-02-12', '2026-02-13', // 春節無交易結算日
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', // 春節連假
  '2026-02-27', '2026-02-28', // 二二八和平紀念日連假
  '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06', // 兒童節及清明連假
  '2026-05-01', // 勞動節
  '2026-06-19', // 端午節連假
  '2026-09-25', '2026-09-28', // 中秋節與教師節連假
  '2026-10-09', '2026-10-10', // 國慶日連假
  '2026-10-25', '2026-10-26', // 臺灣光復紀念日
  '2026-12-25'  // 行憲紀念日
]);
let lastHolidayFetch = 0;
const HOLIDAY_CACHE_TTL = 24 * 60 * 60 * 1000; // 每天更新一次

/**
 * 更新台灣證券交易所 (TWSE) 官方休市日曆
 */
export const updateHolidaySchedule = async () => {
  try {
    const res = await fetch('https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json');
    if (!res.ok) return;
    const data = await res.json();
    if (data.stat === 'ok' && Array.isArray(data.data)) {
      const newSet = new Set();
      for (const row of data.data) {
        const date = row[0]?.trim();
        const desc = row[1] || '';
        // 排除有寫「開始交易日」或「最後交易日」的正常開盤日
        if (date && !desc.includes('開始交易日') && !desc.includes('最後交易日')) {
          newSet.add(date);
        }
      }
      holidayCache = newSet;
      lastHolidayFetch = Date.now();
      logger.info('Helpers', `已成功載入台股休市日曆，共 ${holidayCache.size} 個國定假日與休市日`);
    }
  } catch (e) {
    logger.warn('Helpers', '載入台股休市日曆失敗: ' + e.message);
  }
};

/**
 * 檢查指定日期（預設為今天）是否為台股正常交易日
 * 排除：週六、週日、國定假日、連假、颱風假等市場休市日
 */
export const isTradingDay = (date = new Date()) => {
  const taiwanTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day = taiwanTime.getDay();
  // 1. 週六 (6) 或 週日 (0) 必不開盤
  if (day === 0 || day === 6) return false;

  // 2. 取得台北時區 YYYY-MM-DD
  const year = taiwanTime.getFullYear();
  const month = String(taiwanTime.getMonth() + 1).padStart(2, '0');
  const d = String(taiwanTime.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${d}`;

  // 3. 檢查是否在證交所休市名單內
  if (holidayCache.has(dateStr)) {
    return false;
  }

  // 自動觸發快取更新
  if (Date.now() - lastHolidayFetch > HOLIDAY_CACHE_TTL) {
    updateHolidaySchedule().catch(() => {});
  }

  return true;
};

// 檢查目前時間是否在台股交易時段內 (09:00-13:30，且必須是正常交易日)
export const isMarketOpen = () => {
  // 如果今天不是交易日（連假、國定假日、週末），直接回傳 false
  if (!isTradingDay()) return false;

  const now = new Date();
  const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  
  const hours = taiwanTime.getHours();
  const minutes = taiwanTime.getMinutes();
  const currentTime = hours * 100 + minutes;
  
  const [openH, openM] = MARKET_OPEN.split(':').map(Number);
  const [closeH, closeM] = MARKET_CLOSE.split(':').map(Number);
  
  const openTime = openH * 100 + openM;
  const closeTime = closeH * 100 + closeM;
  
  return currentTime >= openTime && currentTime <= closeTime;
};

// 格式化為台幣 (例如: $1,234.50)
export const formatCurrency = (num) => {
  if (num == null) return 'N/A';
  return 'NT$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 格式化百分比
export const formatPercent = (num) => {
  if (num == null) return 'N/A';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

// 計算損益
export const calcProfitLoss = (entryPrice, currentPrice) => {
  if (!entryPrice || !currentPrice) return { amount: 0, percent: 0 };
  const amount = currentPrice - entryPrice;
  const percent = (amount / entryPrice) * 100;
  return { amount, percent };
};

// 計算移動平均線 (MA)
export const calcMA = (prices, period) => {
  if (prices.length < period) return null;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
};

// 非同步暫停
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 民國年轉 ISO 日期 (例如: 1150812 -> 2026-08-12)
export const rocDateToISO = (rocDate) => {
  if (!rocDate) return null;
  const str = String(rocDate);
  if (str.length < 6) return null;
  const year = parseInt(str.slice(0, -4)) + 1911;
  const month = str.slice(-4, -2);
  const day = str.slice(-2);
  return `${year}-${month}-${day}`;
};

// 啟動時自動載入一次官方休市日曆
updateHolidaySchedule().catch(() => {});
