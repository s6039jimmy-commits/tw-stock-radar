import { logger } from '../../utils/logger.js';

export const fetchNewsByTicker = async (ticker, limit = 5) => {
  try {
    const res = await fetch(`https://news.cnyes.com/api/v3/news/keyword?q=${ticker}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items?.data || []).map(item => ({
      title: item.title,
      summary: item.summary,
      url: `https://news.cnyes.com/news/id/${item.newsId}`,
      publishedAt: new Date(item.publishAt * 1000).toISOString()
    }));
  } catch (error) {
    logger.error('Cnyes News', `取得個股新聞失敗 ${ticker}`, error);
    return [];
  }
};

export const fetchLatestStockNews = async (limit = 20) => {
  try {
    const res = await fetch(`https://news.cnyes.com/api/v3/news/category/tw_stock?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items?.data || []).map(item => ({
      title: item.title,
      summary: item.summary,
      url: `https://news.cnyes.com/news/id/${item.newsId}`,
      publishedAt: new Date(item.publishAt * 1000).toISOString()
    }));
  } catch (error) {
    logger.error('Cnyes News', '取得台股最新新聞失敗', error);
    return [];
  }
};
