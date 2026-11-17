import axios from 'axios';
import { logger } from './logger.js';

let stockNameMap = new Map(); // name -> code
let stockCodeMap = new Map(); // code -> name
let lastUpdate = 0;
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

// 常用基本對應
const COMMON_MAP = {
  '台積電': '2330',
  '鴻海': '2317',
  '聯發科': '2454',
  '廣達': '2382',
  '大盤': 'IX0001',
  '加權指數': 'IX0001',
  '0050': '0050',
  '0056': '0056',
  '006208': '006208',
  '00919': '00919',
  '00929': '00929',
  '沛爾生醫': '6949',
  '沛爾': '6949'
};

export const initStockList = async () => {
  if (Date.now() - lastUpdate < CACHE_TTL && stockNameMap.size > 0) {
    return;
  }

  // 先載入常用
  for (const [name, code] of Object.entries(COMMON_MAP)) {
    stockNameMap.set(name, code);
    stockCodeMap.set(code, name);
  }

  try {
    const res = await axios.get('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', { timeout: 10000 });
    const list = res.data || [];
    for (const item of list) {
      const code = item.Code?.trim();
      const rawName = item.Name?.trim() || '';
      if (!code || !rawName) continue;

      // 清理名稱中的符號，例如 沛爾生醫*-創 -> 沛爾生醫
      const cleanName = rawName.replace(/[\*創新櫃]+/g, '').trim();

      stockNameMap.set(rawName, code);
      if (cleanName && cleanName !== rawName) {
        stockNameMap.set(cleanName, code);
      }
      stockCodeMap.set(code, cleanName || rawName);
    }
    lastUpdate = Date.now();
    logger.info('StockResolver', `全台股清單更新成功，已載入 ${stockNameMap.size} 個股票標稱`);
  } catch (e) {
    logger.warn('StockResolver', '更新台股清單失敗，使用內建常用標的清單: ' + e.message);
  }
};

/**
 * 從使用者文字中自動解析出股票代碼與名稱
 */
export const resolveStock = async (queryText) => {
  if (stockNameMap.size === 0) {
    await initStockList();
  }

  const clean = queryText.replace(/@\S+/g, '').trim();

  // 1. 純數字代碼匹配 (例如 2330, 6949)
  const codeMatch = clean.match(/\b\d{4,6}\b/);
  if (codeMatch) {
    const code = codeMatch[0];
    const name = stockCodeMap.get(code) || code;
    return { symbol: code, name };
  }

  // 2. 名稱完全或部分匹配 (由長到短優先匹配，避免誤判)
  const sortedNames = Array.from(stockNameMap.keys()).sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (name.length >= 2 && clean.includes(name)) {
      const code = stockNameMap.get(name);
      return { symbol: code, name };
    }
  }

  return null;
};
