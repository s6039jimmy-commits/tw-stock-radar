import { MARKET_OPEN, MARKET_CLOSE } from '../config/index.js';

// 檢查目前時間是否在台股交易時段內 (09:00-13:30，平日)
export const isMarketOpen = () => {
  const now = new Date();
  const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day = taiwanTime.getDay();
  // 週末不交易
  if (day === 0 || day === 6) return false;
  
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
