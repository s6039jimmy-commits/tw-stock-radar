import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { getAnnouncementsForSymbol } from '../news/twseNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { logger } from '../../utils/logger.js';

export const aggregateNews = async (symbol, companyName) => {
  try {
    const [cnyes, twse, google] = await Promise.all([
      fetchNewsByTicker(symbol, 3),
      getAnnouncementsForSymbol(symbol),
      fetchNewsForStock(symbol, companyName)
    ]);
    
    return {
      cnyes,
      twse: twse.slice(0, 3),
      google: google.slice(0, 3)
    };
  } catch (error) {
    logger.error('News Monitor', `彙整新聞失敗 ${symbol}`, error);
    return { cnyes: [], twse: [], google: [] };
  }
};

export const scanPositionNews = async (position) => {
  return await aggregateNews(position.symbol, position.name);
};
