import { getQuote, getHistoricalCandles } from '../fugle/marketData.js';
import { calcProfitLoss, calcMA } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';

export const checkPositionPrice = (position, currentQuote) => {
  const currentPrice = currentQuote.close || currentQuote.price;
  return calcProfitLoss(position.entry_price, currentPrice);
};

export const checkSmartExit = async (position, currentPrice) => {
  try {
    // 取得進場日到今天的歷史K線，找出最高價
    const entryDateStr = position.entry_date.split('T')[0];
    const candles = await getHistoricalCandles(position.symbol, entryDateStr, new Date().toISOString().split('T')[0]);
    
    let highestPrice = position.entry_price;
    if (candles && candles.length > 0) {
      for (const c of candles) {
        if (c.high > highestPrice) highestPrice = c.high;
      }
    }
    if (currentPrice > highestPrice) highestPrice = currentPrice;

    const maxProfitPct = ((highestPrice - position.entry_price) / position.entry_price) * 100;
    const currentProfitPct = ((currentPrice - position.entry_price) / position.entry_price) * 100;

    // 智慧移動停利 / 停損邏輯 (靈活變通)
    
    // 1. 如果曾經暴漲超過 20%，啟動「高檔回落停利」：從最高點回跌 8% 就鎖定獲利出場
    if (maxProfitPct >= 20) {
      const trailingStopPrice = highestPrice * 0.92;
      if (currentPrice <= trailingStopPrice) {
        return { 
          triggered: true, 
          type: 'TAKE_PROFIT', 
          reason: `🏆 智慧移動停利：該股曾大漲 ${maxProfitPct.toFixed(1)}% (高點 ${highestPrice})，目前從高點回檔 8%，系統自動鎖住大波段獲利！` 
        };
      }
    }
    // 2. 如果曾經上漲超過 10%，啟動「保本停利」：跌到只剩賺 3% 時強制走人，絕不讓獲利單變成虧損單
    else if (maxProfitPct >= 10) {
      if (currentProfitPct <= 3) {
        return { 
          triggered: true, 
          type: 'TAKE_PROFIT', 
          reason: `🛡️ 智慧保本：該股曾上漲 ${maxProfitPct.toFixed(1)}%，但動能轉弱跌回成本區，提早獲利了結保住本金！` 
        };
      }
    }
    // 3. 如果連 10% 都沒賺到，表示趨勢沒出來，嚴格執行原始停損 (例如 -7%)
    else {
      if (currentProfitPct <= position.stop_loss_pct) {
        return { 
          triggered: true, 
          type: 'STOP_LOSS', 
          reason: `🩸 嚴格停損：未發動即跌破防守線 (${position.stop_loss_pct}%)，為了保護資金，請果斷撤退。` 
        };
      }
    }

    return { triggered: false };
  } catch (e) {
    logger.error('Price Monitor', `智慧出場檢查失敗: ${e.message}`);
    return { triggered: false };
  }
};

export const checkMA5Break = async (position) => {
  if (!position.ma5_exit) return { triggered: false };
  
  const period = position.ma_exit_period || 5;
  const candles = await getHistoricalCandles(position.symbol, '2023-01-01', '2030-01-01');
  if (candles.length < period) return { triggered: false };
  
  const closes = candles.slice(-period).map(c => c.close);
  const ma = calcMA(closes, period);
  const currentPrice = closes[closes.length - 1];
  
  if (currentPrice < ma) {
    return {
      triggered: true,
      reason: `跌破 ${period}日線 (現價: ${currentPrice}, MA${period}: ${ma.toFixed(2)})`
    };
  }
  return { triggered: false };
};
