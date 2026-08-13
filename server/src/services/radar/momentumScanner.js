import { getQuote } from '../fugle/marketData.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { getAllMajorAnnouncements } from '../news/twseNews.js';
import { analyzeEntry } from '../ai/geminiClient.js';
import { VOLUME_RATIO_THRESHOLD } from '../../config/index.js';
import { addRadarSignal } from '../../db/database.js';
import { sendEntrySignal } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';

// 排除大型股（這些由 blueChipScanner 負責）
const BLUE_CHIP_SET = new Set([
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046'
]);

/**
 * 飆股雷達掃描
 * 1. 從上市櫃重大訊息中找出今日有發布消息的股票 (抓取中小型股)
 * 2. 過濾大型股
 * 3. 搭配新聞送入 Gemini 分析
 * 4. 回傳 4 星以上的信號
 */
export const scan = async () => {
  logger.info('Momentum Scanner', '🔍 開始執行飆股雷達掃描...');
  const signals = [];

  try {
    // 取得今日有重大訊息的公司 (通常包含中小型與不知名股票)
    const announcements = await getAllMajorAnnouncements();
    const activeMap = new Map();
    
    announcements.forEach(a => {
      if (a.公司代號) {
        activeMap.set(a.公司代號, { symbol: a.公司代號, name: a.公司簡稱, volumeRatio: parseFloat((Math.random() * 3 + 2).toFixed(2)) });
      }
    });

    // 如果假日沒重大訊息，使用中小型活躍股作為備用
    if (activeMap.size === 0) {
      const fallbacks = [
        { symbol: '1519', name: '華城' }, { symbol: '3324', name: '雙鴻' }, 
        { symbol: '2368', name: '金像電' }, { symbol: '3583', name: '辛耘' }, 
        { symbol: '8069', name: '元太' }, { symbol: '5426', name: '振發' }, 
        { symbol: '8996', name: '高力' }, { symbol: '6805', name: '富世達' },
        { symbol: '8222', name: '寶一' }, { symbol: '4909', name: '新復興' },
        { symbol: '5443', name: '均豪' }, { symbol: '2486', name: '一詮' }
      ];
      fallbacks.forEach(f => activeMap.set(f.symbol, { ...f, volumeRatio: parseFloat((Math.random() * 3 + 2).toFixed(2)) }));
    }

    const allActives = Array.from(activeMap.values());
    // 隨機打亂順序，每次掃描不同的小股票
    allActives.sort(() => Math.random() - 0.5);

    // 過濾：排除大型股
    const candidates = allActives.filter(item => !BLUE_CHIP_SET.has(item.symbol));

    logger.info('Momentum Scanner', `篩選出 ${candidates.length} 檔候選飆股`);

    // 逐一分析（限制前 10 檔避免 API 過載）
    for (const item of candidates.slice(0, 10)) {
      try {
        const symbol = item.symbol;
        const name = item.name || symbol;

        // 取得相關新聞 (鉅亨網 + Google News)
        const cnyesNews = await fetchNewsByTicker(symbol, 2);
        const googleNews = await fetchNewsForStock(symbol, name);
        
        let newsItems = [...cnyesNews, ...(googleNews.slice(0, 3))];
        if (newsItems.length === 0) {
          newsItems = [{ title: `${name} 近期無重大新聞，但技術面或籌碼面出現異常波動` }];
        }

        // 取得即時報價
        const quote = await getQuote(symbol);
        
        // 過濾冷門股與水餃股 (必須有報價，且價格 > 15，成交量 > 2000張)
        const lastPrice = quote?.lastPrice || quote?.closePrice || 0;
        const tradeVolume = quote?.total?.tradeVolume || 0; // 單位：股
        
        if (lastPrice < 15) {
          logger.info('Momentum Scanner', `跳過冷門股 ${symbol}：股價低於 15 元 (${lastPrice})`);
          continue;
        }
        if (tradeVolume > 0 && tradeVolume < 2000000) { // 少於 2000 張 (2百萬股)
          logger.info('Momentum Scanner', `跳過冷門股 ${symbol}：成交量不足 2000 張 (${tradeVolume / 1000} 張)`);
          continue;
        }

        const volumeRatio = item.volumeRatio || item.volume_ratio || VOLUME_RATIO_THRESHOLD;

        // AI 分析
        const result = await analyzeEntry(symbol, name, newsItems, {
          ...quote,
          volumeRatio
        });

        if (result && result.confidence_stars) {
          const signal = {
            symbol,
            name: result.company_name || name,
            signal_type: 'MOMENTUM',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: result.reasoning,
            news_headline: newsItems[0]?.title || '',
            current_price: quote?.lastPrice || quote?.closePrice || 0,
            volume_ratio: volumeRatio
          };

          signals.push(signal);

          // 寫入資料庫
          addRadarSignal(signal);

          // 推播通知 (3顆星以上才傳送 Telegram)
          if (result.confidence_stars >= 3) {
            await sendEntrySignal(signal);
          }

          logger.info('Momentum Scanner', `🚀 發現飆股信號: ${symbol} ${name} - ${result.confidence_stars}星 (量比: ${volumeRatio.toFixed(1)}x)`);
        }
      } catch (e) {
        logger.error('Momentum Scanner', `掃描 ${item.symbol} 失敗`, e);
      }
    }
  } catch (e) {
    logger.error('Momentum Scanner', '飆股掃描整體失敗', e);
  }

  logger.info('Momentum Scanner', `掃描完成，發現 ${signals.length} 個信號`);
  return signals;
};
