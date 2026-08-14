import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

let chipsCache = new Map();
let lastFetchTime = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const fetchTwseChips = async () => {
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/fund/T86');
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return [];
    return await res.json();
  } catch (e) {
    logger.error('Chips', '上市三大法人抓取失敗', e.message);
    return [];
  }
};

const fetchTpexChips = async () => {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_38');
    if (!res.ok) return [];
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) return [];
    return await res.json();
  } catch (e) {
    logger.error('Chips', '上櫃三大法人抓取失敗', e.message);
    return [];
  }
};

export const updateChipsCache = async () => {
  logger.info('Chips', '正在更新上市櫃三大法人買賣超資料...');
  const [twse, tpex] = await Promise.all([fetchTwseChips(), fetchTpexChips()]);
  
  const newCache = new Map();
  
  for (const item of twse) {
    const symbol = item['證券代號'];
    if (!symbol) continue;
    newCache.set(symbol, {
      foreign: parseInt(item['外陸資買賣超股數(不含外資自營商)'] || '0', 10),
      trust: parseInt(item['投信買賣超股數'] || '0', 10),
      dealer: parseInt(item['自營商買賣超股數'] || '0', 10),
      total: parseInt(item['三大法人買賣超股數'] || '0', 10)
    });
  }
  
  for (const item of tpex) {
    const symbol = item['證券代號'];
    if (!symbol) continue;
    newCache.set(symbol, {
      foreign: parseInt(item['外資及陸資買賣超股數(不含外資自營商)'] || '0', 10),
      trust: parseInt(item['投信買賣超股數'] || '0', 10),
      dealer: parseInt(item['自營商買賣超股數'] || '0', 10),
      total: parseInt(item['三大法人買賣超股數合計'] || '0', 10)
    });
  }
  
  if (newCache.size > 0) {
    chipsCache = newCache;
    lastFetchTime = Date.now();
    logger.info('Chips', `成功更新法人籌碼資料，共 ${newCache.size} 筆`);
  }
};

export const getChipsForSymbol = async (symbol) => {
  if (!lastFetchTime || Date.now() - lastFetchTime > CACHE_TTL) {
    await updateChipsCache();
  }
  return chipsCache.get(symbol) || null;
};
