import { getRevenueForSymbol } from '../fundamentals/revenue.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';
import { getBrokerTracking } from '../fundamentals/brokerTracking.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { getAllMajorAnnouncements } from '../news/twseNews.js';
import { analyzeEntry } from '../ai/geminiClient.js';
import { VOLUME_RATIO_THRESHOLD } from '../../config/index.js';
import { addRadarSignal } from '../../db/database.js';
import { sendEntrySignal } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';
import { filterUnscanned, markAsScanned } from '../../utils/scanCache.js';

// 排除大型權值股（交給 blueChipScanner 負責）
const BLUE_CHIP_SET = new Set([
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046'
]);

/**
 * 飆股雷達掃描
 */
export const scan = async () => {
  logger.info('Momentum Scanner', '開始執行飆股雷達掃描...');
  const signals = [];

  try {
    const announcements = await getAllMajorAnnouncements();
    const activeMap = new Map();

    // 依照發言日期與時間進行降冪排序 (最新的重訊排最前面)
    announcements.sort((a, b) => {
      const timeA = parseInt((a.發言日期 || '0') + (a.發言時間 || '0').padStart(6, '0'), 10);
      const timeB = parseInt((b.發言日期 || '0') + (b.發言時間 || '0').padStart(6, '0'), 10);
      return timeB - timeA;
    });

    announcements.forEach(a => {
      if (a.公司代號) {
        // 不在這裡抓取名稱，等抓到即時報價後再計算
        // 因為已經依時間降冪排序，Map 會自動保留最新的插入順序
        if (!activeMap.has(a.公司代號)) {
          activeMap.set(a.公司代號, { symbol: a.公司代號, name: a.公司簡稱 });
        }
      }
    });

    if (activeMap.size === 0) {
      const fallbacks = [
        { symbol: '1519', name: '華城' }, { symbol: '3324', name: '雙鴻' }, 
        { symbol: '2368', name: '金像電' }, { symbol: '3583', name: '辛耘' }, 
        { symbol: '8069', name: '元太' }, { symbol: '5426', name: '振發' }, 
        { symbol: '8996', name: '高力' }, { symbol: '6805', name: '富世達' },
        { symbol: '8222', name: '寶一' }, { symbol: '4909', name: '新復興' },
        { symbol: '5443', name: '均豪' }, { symbol: '2486', name: '一詮' }
      ];
      fallbacks.forEach(f => activeMap.set(f.symbol, { ...f }));
    }

    const allActives = Array.from(activeMap.values());
    const candidates = allActives.filter(item => !BLUE_CHIP_SET.has(item.symbol));
    
    // 過濾出今天還沒掃描過的
    const candidateSymbols = candidates.map(c => c.symbol);
    const unscannedSymbols = filterUnscanned(candidateSymbols);
    const unscannedCandidates = candidates.filter(c => unscannedSymbols.includes(c.symbol));

    logger.info('Momentum Scanner', `最新候選飆股: ${candidates.length} 檔，剩餘未掃描: ${unscannedCandidates.length} 檔`);

    // 每次取 10 檔避免 API 限制
    const toScan = unscannedCandidates.slice(0, 10);

    for (const item of toScan) {
      try {
        markAsScanned(item.symbol); // 標記為已掃描
        const symbol = item.symbol;
        const name = item.name || symbol;

        const cnyesNews = await fetchNewsByTicker(symbol, 2);
        const googleNews = await fetchNewsForStock(symbol, name);
        
        let newsItems = [...cnyesNews, ...(googleNews.slice(0, 3))];
        if (newsItems.length === 0) {
          newsItems = [{ title: `${name} 近期無重大新聞，但技術面或籌碼面出現異常波動` }];
        }

        const [quote, revenue, chips, brokers] = await Promise.all([
          getQuote(symbol),
          getRevenueForSymbol(symbol),
          getChipsForSymbol(symbol),
          getBrokerTracking(symbol)
        ]);
        
        const lastPrice = quote?.lastPrice || quote?.closePrice || 0;
        const tradeVolume = quote?.total?.tradeVolume || 0;
        
        if (lastPrice < 15) {
          continue;
        }
        if (tradeVolume > 0 && tradeVolume < 1000000) {
          continue;
        }

        // 從真實報價計算量比（今日量 / 預估均量，用 total.tradeVolume 估算）
        // Fugle 不直接提供 20日均量，以今日成交量 / 500000 張作為基準估算
        const avgVolEstimate = 500000; // 中型股平均基準
        const realVolumeRatio = tradeVolume > 0 
          ? parseFloat((tradeVolume / avgVolEstimate).toFixed(2))
          : parseFloat(VOLUME_RATIO_THRESHOLD);

        const hasAnnouncement = announcements.some(a => a.公司代號?.trim() === symbol);

        const result = await analyzeEntry(symbol, name, newsItems, {
          ...quote,
          volumeRatio: realVolumeRatio
        }, revenue, chips, brokers, { hasAnnouncement });

        if (result && result.confidence_stars) {
          const signal = {
            symbol,
            name: result.company_name || name,
            signal_type: 'MOMENTUM',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: `${result.catalyst || ''}\n\n📍 操作建議：${result.action_plan || ''}`,
            news_headline: newsItems[0]?.title || '',
            current_price: quote?.lastPrice || quote?.closePrice || 0,
            volume_ratio: realVolumeRatio
          };

          signals.push(signal);

          // 寫入資料庫
          await addRadarSignal(signal);

          // 推播通知 (4顆星以上才傳送 Telegram)
          if (result.confidence_stars >= 4) {
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
