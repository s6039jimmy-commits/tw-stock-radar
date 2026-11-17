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
let holidayNames = new Map([
  ['2026-01-01', '中華民國開國紀念日'],
  ['2026-02-12', '春節結算無交易日'],
  ['2026-02-13', '春節結算無交易日'],
  ['2026-02-15', '農曆除夕及春節'],
  ['2026-02-16', '農曆除夕及春節'],
  ['2026-02-17', '農曆除夕及春節'],
  ['2026-02-18', '農曆除夕及春節'],
  ['2026-02-19', '農曆除夕及春節'],
  ['2026-02-20', '農曆除夕及春節補假'],
  ['2026-02-27', '和平紀念日補假'],
  ['2026-02-28', '和平紀念日'],
  ['2026-04-03', '兒童節及民族掃墓節'],
  ['2026-04-04', '兒童節及民族掃墓節'],
  ['2026-04-05', '民族掃墓節'],
  ['2026-04-06', '民族掃墓節補假'],
  ['2026-05-01', '勞動節'],
  ['2026-06-19', '端午節'],
  ['2026-09-25', '中秋節'],
  ['2026-09-28', '孔子誕辰/教師節'],
  ['2026-10-09', '國慶日補假'],
  ['2026-10-10', '國慶日'],
  ['2026-10-25', '臺灣光復紀念日'],
  ['2026-10-26', '臺灣光復紀念日補假'],
  ['2026-12-25', '行憲紀念日']
]);
let lastHolidayFetch = 0;
const HOLIDAY_CACHE_TTL = 24 * 60 * 60 * 1000; // 每天更新一次

// 美股 (NYSE / NASDAQ) 官方節日休市日曆名稱對照 (2025-2027)
export const US_HOLIDAY_NAMES = new Map([
  // 2025
  ['2025-01-01', '元旦 (New Year)'],
  ['2025-01-20', '馬丁路德金紀念日 (MLK Day)'],
  ['2025-02-17', '華盛頓誕辰/總統日 (Presidents Day)'],
  ['2025-04-18', '耶穌受難日 (Good Friday)'],
  ['2025-05-26', '陣亡將士紀念日 (Memorial Day)'],
  ['2025-06-19', '六月節獨立日 (Juneteenth)'],
  ['2025-07-04', '獨立紀念日 (Independence Day)'],
  ['2025-09-01', '勞動節 (Labor Day)'],
  ['2025-11-27', '感恩節 (Thanksgiving)'],
  ['2025-12-25', '聖誕節 (Christmas)'],
  // 2026
  ['2026-01-01', '元旦 (New Year)'],
  ['2026-01-19', '馬丁路德金紀念日 (MLK Day)'],
  ['2026-02-16', '華盛頓誕辰/總統日 (Presidents Day)'],
  ['2026-04-03', '耶穌受難日 (Good Friday)'],
  ['2026-05-25', '陣亡將士紀念日 (Memorial Day)'],
  ['2026-06-19', '六月節獨立日 (Juneteenth)'],
  ['2026-07-03', '獨立紀念日補假 (Independence Day)'],
  ['2026-09-07', '勞動節 (Labor Day)'],
  ['2026-11-26', '感恩節 (Thanksgiving)'],
  ['2026-12-25', '聖誕節 (Christmas)'],
  // 2027
  ['2027-01-01', '元旦 (New Year)'],
  ['2027-01-18', '馬丁路德金紀念日 (MLK Day)'],
  ['2027-02-15', '華盛頓誕辰/總統日 (Presidents Day)'],
  ['2027-03-26', '耶穌受難日 (Good Friday)'],
  ['2027-05-31', '陣亡將士紀念日 (Memorial Day)'],
  ['2027-06-18', '六月節獨立日補假 (Juneteenth)'],
  ['2027-07-05', '獨立紀念日補假 (Independence Day)'],
  ['2027-09-06', '勞動節 (Labor Day)'],
  ['2027-11-25', '感恩節 (Thanksgiving)'],
  ['2027-12-24', '聖誕節補假 (Christmas)']
]);

export const US_HOLIDAYS = new Set(US_HOLIDAY_NAMES.keys());

/**
 * 檢查美股當天是否開盤（排除六日與美股官方國定假日）
 */
export const isUsTradingDay = (date = new Date()) => {
  const usTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = usTime.getDay();
  if (day === 0 || day === 6) return false;
  const year = usTime.getFullYear();
  const month = String(usTime.getMonth() + 1).padStart(2, '0');
  const d = String(usTime.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${d}`;
  return !US_HOLIDAYS.has(dateStr);
};

/**
 * 檢查目前是否在美股盤中交易時段 (紐約時間 09:30 - 16:00)
 */
export const isUsMarketOpen = (date = new Date()) => {
  if (!isUsTradingDay(date)) return false;
  const usTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hm = usTime.getHours() * 100 + usTime.getMinutes();
  return hm >= 930 && hm <= 1600;
};

/**
 * 取得明日台股與美股的休市預警通知（若有國定假日或節日休市）
 * 排除常規週六日，專門提示「明日國定假日休市」與「美股節日休市」
 */
export const getMarketHolidayAlerts = (baseDate = new Date()) => {
  const alerts = [];
  
  // 1. 計算明日 (台北時區)
  const twToday = new Date(baseDate.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const twTomorrow = new Date(twToday.getTime() + 24 * 60 * 60 * 1000);
  const twTomorrowDay = twTomorrow.getDay(); // 0 是週日, 6 是週六
  
  const y = twTomorrow.getFullYear();
  const m = String(twTomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(twTomorrow.getDate()).padStart(2, '0');
  const twTomorrowStr = `${y}-${m}-${d}`;
  
  // 檢查明日是否為台股國定假日（排除普通六日）
  if (holidayCache.has(twTomorrowStr)) {
    const hName = holidayNames.get(twTomorrowStr) || '國定假日';
    alerts.push(`🏮 <b>【台股明日休市提醒】</b>：明日 (${m}/${d}) 適逢「${hName}」台股休市一日，明日 14:05 暫停推播。`);
  } else if (twTomorrowDay === 6) {
    alerts.push(`🏖️ <b>【週末休市提醒】</b>：明日進入週末休市，祝週末愉快！下週一 14:05 準時恢復預測。`);
  }

  // 2. 檢查今晚/明日美股是否休市
  // 台北時間 14:05 時，美股即將在今晚開盤 (美股當天早上)
  const usToday = new Date(baseDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const uy = usToday.getFullYear();
  const um = String(usToday.getMonth() + 1).padStart(2, '0');
  const ud = String(usToday.getDate()).padStart(2, '0');
  const usTodayStr = `${uy}-${um}-${ud}`;
  
  // 今晚美股是否有節日休市
  if (US_HOLIDAY_NAMES.has(usTodayStr)) {
    const usHName = US_HOLIDAY_NAMES.get(usTodayStr);
    alerts.push(`🗽 <b>【美股今晚休市提醒】</b>：美股今晚適逢「${usHName}」全日休市，無夜盤 ADR 波動。`);
  }
  
  // 明天晚上美股是否休市 (如果明天是平日)
  const usTomorrow = new Date(usToday.getTime() + 24 * 60 * 60 * 1000);
  const uy2 = usTomorrow.getFullYear();
  const um2 = String(usTomorrow.getMonth() + 1).padStart(2, '0');
  const ud2 = String(usTomorrow.getDate()).padStart(2, '0');
  const usTomorrowStr = `${uy2}-${um2}-${ud2}`;
  if (US_HOLIDAY_NAMES.has(usTomorrowStr) && usTomorrow.getDay() !== 0 && usTomorrow.getDay() !== 6) {
    const usHName2 = US_HOLIDAY_NAMES.get(usTomorrowStr);
    alerts.push(`🗽 <b>【美股明日休市預告】</b>：美股明日 (${um2}/${ud2}) 適逢「${usHName2}」全日休市。`);
  }
  
  return alerts;
};

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
