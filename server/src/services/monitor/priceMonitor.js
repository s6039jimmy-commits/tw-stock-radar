import { getQuote, getHistoricalCandles } from '../fugle/marketData.js';
import { calcProfitLoss, calcMA } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';

export const checkPositionPrice = (position, currentQuote) => {
  const currentPrice = currentQuote.close || currentQuote.price;
  return calcProfitLoss(position.entry_price, currentPrice);
};

export const checkStopLoss = (position, currentPrice) => {
  const { percent } = calcProfitLoss(position.entry_price, currentPrice);
  if (percent <= position.stop_loss_pct) {
    return {
      triggered: true,
      reason: `觸發停損 (${percent.toFixed(2)}% <= ${position.stop_loss_pct}%)`
    };
  }
  return { triggered: false };
};

export const checkTakeProfit = (position, currentPrice) => {
  const { percent } = calcProfitLoss(position.entry_price, currentPrice);
  if (percent >= position.take_profit_pct) {
    return {
      triggered: true,
      reason: `觸發停利 (${percent.toFixed(2)}% >= ${position.take_profit_pct}%)`
    };
  }
  return { triggered: false };
};

export const checkMA5Break = async (position) => {
  if (!position.ma5_exit) return { triggered: false };
  
  const candles = await getHistoricalCandles(position.symbol, '2023-01-01', '2030-01-01');
  if (candles.length < 5) return { triggered: false };
  
  const closes = candles.slice(-5).map(c => c.close);
  const ma5 = calcMA(closes, 5);
  const currentPrice = closes[closes.length - 1];
  
  if (currentPrice < ma5) {
    return {
      triggered: true,
      reason: `跌破 5日線 (目前: ${currentPrice}, MA5: ${ma5.toFixed(2)})`
    };
  }
  return { triggered: false };
};
