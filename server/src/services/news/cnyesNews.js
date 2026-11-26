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

let cachedHeadlines = null;
let lastHeadlineFetch = 0;
const HEADLINE_CACHE_MS = 8 * 60 * 1000; // 8 分鐘快取

/**
 * 聚合全市場最新最熱門政經頭條 (台股、美股、頭條快訊)，精準捕捉川普關稅、Fed降息等突發核彈級事件
 */
export const fetchTopHeadlines = async (limit = 8) => {
  const now = Date.now();
  if (cachedHeadlines && (now - lastHeadlineFetch < HEADLINE_CACHE_MS)) {
    return cachedHeadlines;
  }

  try {
    const [hRes, tRes, wRes] = await Promise.all([
      fetch('https://news.cnyes.com/api/v3/news/category/headline?limit=12').then(r => r.json()).catch(() => null),
      fetch('https://news.cnyes.com/api/v3/news/category/tw_stock?limit=15').then(r => r.json()).catch(() => null),
      fetch('https://news.cnyes.com/api/v3/news/category/wd_stock?limit=12').then(r => r.json()).catch(() => null)
    ]);

    const all = [
      ...(tRes?.items?.data || []),
      ...(hRes?.items?.data || []),
      ...(wRes?.items?.data || [])
    ];

    const seen = new Set();
    const unique = [];
    const MARKET_CATALYST_REGEX = /(關稅|川普|重挫|大跌|暴跌|殺盤|崩盤|跌逾|拋售|禁令|制裁|急彈|噴漲|狂飆|外資|輝達|黃仁勳|台積電|降息|升息|通膨|cpi|聯準會|fed)/i;

    for (const item of all) {
      const title = item.title?.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      unique.push({
        title,
        summary: item.summary?.trim() || '',
        publishedAt: item.publishAt || 0
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const RECENT_12H_SEC = 12 * 3600;
    unique.sort((a, b) => {
      const aRecent = (nowSec - (a.publishedAt || 0)) <= RECENT_12H_SEC ? 1 : 0;
      const bRecent = (nowSec - (b.publishedAt || 0)) <= RECENT_12H_SEC ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;

      const aPri = MARKET_CATALYST_REGEX.test(a.title) ? 1 : 0;
      const bPri = MARKET_CATALYST_REGEX.test(b.title) ? 1 : 0;
      if (aPri !== bPri) return bPri - aPri;
      return (b.publishedAt || 0) - (a.publishedAt || 0);
    });

    cachedHeadlines = unique.slice(0, limit);
    lastHeadlineFetch = now;
    return cachedHeadlines;
  } catch (err) {
    logger.warn('Cnyes News', '取得即時頭條失敗: ' + err.message);
    return cachedHeadlines || [];
  }
};
