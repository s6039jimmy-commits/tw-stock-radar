import { checkStopLoss, checkTakeProfit, checkMA5Break } from './priceMonitor.js';
import { scanPositionNews } from './newsMonitor.js';
import { analyzeExit } from '../ai/geminiClient.js';
import { getQuote } from '../fugle/marketData.js';
import { addExitAlert, getSetting } from '../../db/database.js';
import { sendExitAlert } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';
import { AI_DANGER_LEVEL_THRESHOLD } from '../../config/index.js';
import { getRevenueForSymbol } from '../fundamentals/revenue.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';

/**
 * 評估單一持倉的出場條件
 * 執行順序：停損 > 停利 > MA5 > 消息面
 */
export const evaluatePosition = async (position) => {
  try {
    const quote = await getQuote(position.symbol);
    if (!quote) return null;
    
    const currentPrice = quote.lastPrice || quote.closePrice || 0;
    if (currentPrice <= 0) return null;

    // 1. 消息面 AI 風險判斷 (最高優先權：一旦有重大利空立刻要求掛單賣出)
    const news = await scanPositionNews(position);
    const allNews = [...(news.cnyes || []), ...(news.twse || []), ...(news.google || [])];
    const headlines = allNews.map(n => n.title || n.主旨).filter(Boolean);
    
    if (headlines.length > 0) {
      const [revenue, chips] = await Promise.all([
        getRevenueForSymbol(position.symbol),
        getChipsForSymbol(position.symbol)
      ]);

      const aiResult = await analyzeExit(
        position.symbol, 
        position.name, 
        position, 
        headlines.map(h => ({ title: h })),
        revenue,
        chips
      );

      const dangerLevelThreshold = parseInt(getSetting('AI_DANGER_LEVEL_THRESHOLD') || AI_DANGER_LEVEL_THRESHOLD || '4', 10);
      if (aiResult && aiResult.is_exit_signal && aiResult.danger_level >= dangerLevelThreshold) {
        return processExitAlert(position, 'NEWS_EXIT', {
          price: currentPrice,
          reason: `🚨 重大突發利空！請立即掛「市價單」賣出！ (危險等級: ${aiResult.danger_level}/${dangerLevelThreshold})`,
          ai_analysis: aiResult.reasoning
        });
      }
    }

    // 2. 停損檢查
    const sl = checkStopLoss(position, currentPrice);
    if (sl.triggered) {
      return processExitAlert(position, 'STOP_LOSS', { price: currentPrice, reason: sl.reason });
    }

    // 3. 停利檢查
    const tp = checkTakeProfit(position, currentPrice);
    if (tp.triggered) {
      return processExitAlert(position, 'TAKE_PROFIT', { price: currentPrice, reason: tp.reason });
    }

    // 4. MA5 跌破檢查
    if (position.ma5_exit) {
      const ma5 = await checkMA5Break(position);
      if (ma5.triggered) {
        return processExitAlert(position, 'MA5_BREAK', { price: currentPrice, reason: ma5.reason });
      }
    }

    return null;
  } catch (e) {
    logger.error('Exit Engine', `評估 ${position.symbol} 出場條件失敗`, e);
    return null;
  }
};

/**
 * 盤前專用：僅評估突發新聞與消息面，不依賴開盤價
 */
export const evaluatePositionNewsOnly = async (position) => {
  try {
    const news = await scanPositionNews(position);
    const allNews = [...(news.cnyes || []), ...(news.twse || []), ...(news.google || [])];
    const headlines = allNews.map(n => n.title || n.主旨).filter(Boolean);
    
    if (headlines.length > 0) {
      const [revenue, chips] = await Promise.all([
        getRevenueForSymbol(position.symbol),
        getChipsForSymbol(position.symbol)
      ]);

      const aiResult = await analyzeExit(
        position.symbol, 
        position.name, 
        position, 
        headlines.map(h => ({ title: h })),
        revenue,
        chips
      );

      const dangerLevelThreshold = parseInt(getSetting('AI_DANGER_LEVEL_THRESHOLD') || AI_DANGER_LEVEL_THRESHOLD || '4', 10);
      if (aiResult && aiResult.is_exit_signal && aiResult.danger_level >= dangerLevelThreshold) {
        return processExitAlert(position, 'PRE_MARKET_EXIT', {
          price: position.current_price || position.entry_price, // 盤前可能無最新報價，用現有價
          reason: `🚨 開盤前極度危險！請立即掛「市價單」賣出！ (危險等級: ${aiResult.danger_level}/${dangerLevelThreshold})`,
          ai_analysis: aiResult.reasoning
        });
      }
    }
    return null;
  } catch (e) {
    logger.error('Exit Engine', `盤前評估 ${position.symbol} 新聞失敗`, e);
    return null;
  }
};

/**
 * 處理出場警報：寫入資料庫 + 推播通知
 */
export const processExitAlert = async (position, alertType, triggerData) => {
  const alert = {
    position_id: position.id,
    symbol: position.symbol,
    alert_type: alertType,
    trigger_price: triggerData.price,
    trigger_reason: triggerData.reason,
    ai_analysis: triggerData.ai_analysis || ''
  };

  try {
    const profitPct = ((triggerData.price - position.entry_price) / position.entry_price) * 100;
    
    addExitAlert(alert);
    await sendExitAlert(alert, position, profitPct);
    logger.info('Exit Engine', `🚨 觸發出場警報 [${alertType}] ${position.symbol} @ ${triggerData.price} (損益: ${profitPct.toFixed(2)}%)`);
  } catch (e) {
    logger.error('Exit Engine', `處理出場警報失敗`, e);
  }

  return alert;
};
