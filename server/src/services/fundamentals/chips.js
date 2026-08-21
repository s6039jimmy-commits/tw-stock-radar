import fetch from 'node-fetch';
import { logger } from '../../utils/logger.js';

let chipsCache = new Map();
let lastFetchTime = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

const fetchTwseChips = async () => {
  try {
    const res = await fetch('https://www.twse.com.tw/fund/T86?response=json&selectType=ALL');
    if (!res.ok) return [];
    const data = await res.json();
    if (data.stat !== 'OK' || !data.data) return [];
    
    // Map fields
    const fields = data.fields;
    const symbolIdx = fields.indexOf('證券代號');
    const foreignIdx = fields.indexOf('外陸資買賣超股數(不含外資自營商)');
    const trustIdx = fields.indexOf('投信買賣超股數');
    const dealerIdx = fields.indexOf('自營商買賣超股數');
    const totalIdx = fields.indexOf('三大法人買賣超股數');

    return data.data.map(row => ({
      symbol: row[symbolIdx]?.trim(),
      foreign: parseInt(row[foreignIdx]?.replace(/,/g, '') || '0', 10),
      trust: parseInt(row[trustIdx]?.replace(/,/g, '') || '0', 10),
      dealer: parseInt(row[dealerIdx]?.replace(/,/g, '') || '0', 10),
      total: parseInt(row[totalIdx]?.replace(/,/g, '') || '0', 10)
    }));
  } catch (e) {
    logger.error('Chips', '上市三大法人抓取失敗', e.message);
    return [];
  }
};

const fetchTpexChips = async () => {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading');
    if (!res.ok) return [];
    const data = await res.json();
    
    return data.map(item => ({
      symbol: item['SecuritiesCompanyCode'],
      foreign: parseInt(item['Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference'] || '0', 10),
      trust: parseInt(item['SecuritiesInvestmentTrustCompanies-Difference'] || '0', 10),
      dealer: parseInt(item['Dealers-Difference'] || '0', 10),
      total: parseInt(item['TotalDifference'] || '0', 10)
    }));
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
    if (!item.symbol) continue;
    newCache.set(item.symbol, {
      foreign: item.foreign,
      trust: item.trust,
      dealer: item.dealer,
      total: item.total
    });
  }
  
  for (const item of tpex) {
    if (!item.symbol) continue;
    newCache.set(item.symbol, {
      foreign: item.foreign,
      trust: item.trust,
      dealer: item.dealer,
      total: item.total
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
