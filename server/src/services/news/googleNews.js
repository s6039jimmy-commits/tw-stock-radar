import Parser from 'rss-parser';
import { logger } from '../../utils/logger.js';

const parser = new Parser();

export const fetchNewsForStock = async (ticker, companyName) => {
  try {
    const query = encodeURIComponent(`${ticker} OR ${companyName}`);
    const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`);
    
    return feed.items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source
    }));
  } catch (error) {
    logger.error('Google News', `取得 Google News 失敗 ${ticker}`, error);
    return [];
  }
};
