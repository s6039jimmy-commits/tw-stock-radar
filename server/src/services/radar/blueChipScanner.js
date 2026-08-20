import { getRevenueForSymbol } from '../fundamentals/revenue.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';
import { BLUE_CHIP_TOP_N } from '../../config/index.js';
import { getAllMajorAnnouncements } from '../news/twseNews.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { analyzeEntry } from '../ai/geminiClient.js';
import { getQuote } from '../fugle/marketData.js';
import { addRadarSignal } from '../../db/database.js';
import { sendEntrySignal } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';
import { filterUnscanned, markAsScanned } from '../../utils/scanCache.js';

// 台股市值前 50 大權值股
const BLUE_CHIP_SYMBOLS = [
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046',
  '2105','9910','6505','3231','2379','6415','3045','2345','1590','2207'
];

/**
 * 大型股雷達掃描
 * 1. 取得 TWSE/TPEX 重大訊息
 * 2. 找出有重大消息的權值股
 * 3. 搭配鉅亨網新聞送入 Gemini 分析
 * 4. 回傳 4 星以上的信號
 */
export const scan = async () => {
  logger.info('BlueChip Scanner', '🔍 開始執行大型股雷達掃描...');
  const signals = [];

  try {
    // 取得今日重大訊息，作為補充資料
    const announcements = await getAllMajorAnnouncements();
    const announcementMap = {};
    for (const ann of announcements) {
      const sym = ann.公司代號?.trim();
      if (!sym) continue;
      if (!announcementMap[sym]) announcementMap[sym] = [];
      announcementMap[sym].push(ann.主旨 || '');
    }

    // 永遠掃描前 N 大權值股（不管今天有沒有發新聞）
    const targetSymbols = BLUE_CHIP_SYMBOLS.slice(0, BLUE_CHIP_TOP_N);
    const unscanned = filterUnscanned(targetSymbols);
    
    logger.info('BlueChip Scanner', `剩餘未掃描的大型股: ${unscanned.length} 檔`);

    // 每次取 10 檔避免 API 限制
    const toScan = unscanned.slice(0, 10);
    
    // 逐一分析
    for (const symbol of toScan) {
      try {
        markAsScanned(symbol); // 標記為已掃描
        const name = '';
        const annHeadlines = announcementMap[symbol] || [];
        
        // 收集新聞
        const [cnyesNews, googleNewsRaw] = await Promise.all([
          fetchNewsByTicker(symbol, 3),
          fetchNewsForStock(symbol, symbol)
        ]);

        const newsItems = [
          ...annHeadlines.map(h => ({ title: h })),
          ...cnyesNews,
          ...googleNewsRaw.slice(0, 3)
        ];

        if (newsItems.length === 0) {
          newsItems.push({ title: `${symbol} 今日無重大新聞，分析近期技術面與籌碼面` });
        }

        // 取得即時報價與基本面籌碼
        const [quote, revenue, chips] = await Promise.all([
          getQuote(symbol),
          getRevenueForSymbol(symbol),
          getChipsForSymbol(symbol)
        ]);

        const stockName = name || quote?.name || symbol;

        // AI 分析
        const result = await analyzeEntry(symbol, stockName, newsItems, quote, revenue, chips);

        if (result && result.confidence_stars) {
          const signal = {
            symbol,
            name: result.company_name || stockName,
            signal_type: 'BLUE_CHIP',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: `${result.catalyst || ''}\n\n📍 操作建議：${result.action_plan || ''}`,
            news_headline: newsItems[0]?.title || '',
            current_price: quote?.lastPrice || quote?.closePrice || 0,
            volume_ratio: 1.0
          };
          
          signals.push(signal);
          
          // 寫入資料庫
          await addRadarSignal(signal);
          
          // 推播通知 (4顆星以上才傳 Telegram)
          if (result.confidence_stars >= 4) {
            await sendEntrySignal(signal);
          }
          
          logger.info('BlueChip Scanner', `✨ 發現信號: ${symbol} ${stockName} - ${result.confidence_stars}星`);
        }
      } catch (e) {
        logger.error('BlueChip Scanner', `掃描 ${symbol} 失敗`, e.message);
      }
    }
  } catch (e) {
    logger.error('BlueChip Scanner', '大型股掃描整體失敗', e);
  }

  logger.info('BlueChip Scanner', `掃描完成，發現 ${signals.length} 個信號`);
  return signals;
};
