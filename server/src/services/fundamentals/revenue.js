import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

let revenueCache = new Map();
let lastFetchTime = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const fetchTwseRevenue = async () => {
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap05_L');
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    logger.error('Revenue', '上市營收抓取失敗', e);
    return [];
  }
};

const fetchTpexRevenue = async () => {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/mops_t187ap05_O');
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    logger.error('Revenue', '上櫃營收抓取失敗', e);
    return [];
  }
};

export const updateRevenueCache = async () => {
  logger.info('Revenue', '正在更新上市櫃月營收資料...');
  const [twse, tpex] = await Promise.all([fetchTwseRevenue(), fetchTpexRevenue()]);
  
  const allData = [...twse, ...tpex];
  const newCache = new Map();
  
  for (const item of allData) {
    const symbol = item['公司代號'];
    if (!symbol) continue;
    
    newCache.set(symbol, {
      dataMonth: item['資料年月'],
      revenueMonth: parseFloat(item['營業收入-當月營收'] || 0),
      revenueLastMonth: parseFloat(item['營業收入-上月營收'] || 0),
      revenueLastYear: parseFloat(item['營業收入-去年當月營收'] || 0),
      mom: parseFloat(item['營業收入-上月比較增減(%)'] || 0),
      yoy: parseFloat(item['營業收入-去年同月增減(%)'] || 0),
      accumulatedYoy: parseFloat(item['累計營業收入-前期比較增減(%)'] || 0)
    });
  }
  
  if (newCache.size > 0) {
    revenueCache = newCache;
    lastFetchTime = Date.now();
    logger.info('Revenue', `成功更新營收資料，共 ${newCache.size} 筆`);
  }
};

export const getRevenueForSymbol = async (symbol) => {
  if (!lastFetchTime || Date.now() - lastFetchTime > CACHE_TTL) {
    await updateRevenueCache();
  }
  return revenueCache.get(symbol) || null;
};
