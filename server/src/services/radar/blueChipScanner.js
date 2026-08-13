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
    // 取得所有重大訊息
    const announcements = await getAllMajorAnnouncements();
    
    // 篩選出權值股的公告
    const targetSymbols = BLUE_CHIP_SYMBOLS.slice(0, BLUE_CHIP_TOP_N);
    const relevantAnnouncements = announcements.filter(a => 
      targetSymbols.includes(a.公司代號?.trim())
    );

    if (relevantAnnouncements.length === 0) {
      logger.info('BlueChip Scanner', '本次掃描未發現權值股重大訊息');
      return signals;
    }

    // 按股票代號分組
    const grouped = {};
    for (const ann of relevantAnnouncements) {
      const sym = ann.公司代號?.trim();
      if (!grouped[sym]) grouped[sym] = { name: ann.公司名稱?.trim(), announcements: [] };
      grouped[sym].announcements.push(ann);
    }

    // 逐一分析
    for (const [symbol, data] of Object.entries(grouped)) {
      try {
        // 收集新聞
        const newsHeadlines = data.announcements.map(a => a.主旨 || '');
        
        // 嘗試取得鉅亨網新聞作為補充
        const cnyesNews = await fetchNewsByTicker(symbol, 2);
        if (cnyesNews.length > 0) {
          newsHeadlines.push(...cnyesNews.map(n => n.title));
        }

        const googleNews = await fetchNewsForStock(symbol, data.name);
        if (googleNews.length > 0) {
          newsHeadlines.push(...googleNews.slice(0, 3).map(n => n.title));
        }

        // 取得即時報價與基本面籌碼
        const [quote, revenue, chips] = await Promise.all([
          getQuote(symbol),
          getRevenueForSymbol(symbol),
          getChipsForSymbol(symbol)
        ]);

        // AI 分析
        const result = await analyzeEntry(symbol, data.name, 
          newsHeadlines.map(h => ({ title: h })),
          quote,
          revenue,
          chips
        );

        if (result && result.confidence_stars) {
          const signal = {
            symbol,
            name: result.company_name || data.name,
            signal_type: 'BLUE_CHIP',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: `${result.catalyst || ''}\n\n📍 操作建議：${result.action_plan || ''}`,
            news_headline: newsHeadlines[0] || '',
            current_price: quote?.lastPrice || quote?.closePrice || 0,
            volume_ratio: 1.0
          };
          
          signals.push(signal);
          
          // 寫入資料庫
          addRadarSignal(signal);
          
          // 推播通知 (3顆星以上才傳送 Telegram)
          if (result.confidence_stars >= 3) {
            await sendEntrySignal(signal);
          }
          
          logger.info('BlueChip Scanner', `✨ 發現信號: ${symbol} ${data.name} - ${result.confidence_stars}星`);
        }
      } catch (e) {
        logger.error('BlueChip Scanner', `掃描 ${symbol} 失敗`, e);
      }
    }
  } catch (e) {
    logger.error('BlueChip Scanner', '大型股掃描整體失敗', e);
  }

  logger.info('BlueChip Scanner', `掃描完成，發現 ${signals.length} 個信號`);
  return signals;
};
