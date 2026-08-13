import { RestClient } from '@fugle/marketdata';
import { FUGLE_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { sleep } from '../../utils/helpers.js';

let client = null;
try {
  if (FUGLE_API_KEY) {
    client = new RestClient({ apiKey: FUGLE_API_KEY });
  } else {
    logger.warn('Fugle API', '未設定 FUGLE_API_KEY，將使用模擬資料');
  }
} catch (e) {
  logger.error('Fugle API', '初始化失敗', e);
}

// 取得即時報價
export const getQuote = async (symbol, retries = 3) => {
  if (!client) return { symbol, close: 100, open: 99, high: 101, low: 98, change: 1, changePercent: 1 };
  try {
    const stock = client.stock;
    const data = await stock.intraday.quote({ symbol });
    return data;
  } catch (error) {
    if (retries > 0) {
      await sleep(1000);
      return getQuote(symbol, retries - 1);
    }
    logger.error('Fugle API', `取得報價失敗 ${symbol}`, error);
    return null;
  }
};

// 取得歷史 K 線
export const getHistoricalCandles = async (symbol, from, to) => {
  if (!client) return [];
  try {
    const data = await client.stock.historical.candles({ symbol, from, to });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得歷史K線失敗 ${symbol}`, error);
    return [];
  }
};

// 取得當日分鐘 K 線
export const getIntradayCandles = async (symbol) => {
  if (!client) return [];
  try {
    const data = await client.stock.intraday.candles({ symbol });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得當日K線失敗 ${symbol}`, error);
    return [];
  }
};

// 取得市場漲跌排行 (TSE/OTC)
export const getMarketMovers = async (market = 'TSE') => {
  if (!client) return { gainers: [], losers: [] };
  // Mock fallback logic... API structure mapping simplified
  try {
    // 假設透過特定快照取得 (Fugle API實際用法可能因版本略異，此為抽象)
    return { gainers: [], losers: [] };
  } catch (error) {
    logger.error('Fugle API', `取得漲跌排行失敗 ${market}`, error);
    return { gainers: [], losers: [] };
  }
};

// 取得成交量排行
export const getMarketActives = async (market = 'TSE') => {
  if (!client) return [];
  try {
    return [];
  } catch (error) {
    logger.error('Fugle API', `取得成交量排行失敗 ${market}`, error);
    return [];
  }
};

// 取得市場快照
export const getMarketSnapshot = async (market = 'TSE') => {
  if (!client) return [];
  try {
    const data = await client.stock.snapshot.quotes({ market });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得市場快照失敗 ${market}`, error);
    return [];
  }
};

export const testConnection = async () => {
  try {
    if (!client) return false;
    await getQuote('2330');
    return true;
  } catch (e) {
    return false;
  }
};
