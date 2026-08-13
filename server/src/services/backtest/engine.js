import { getHistoricalData } from './dataProvider.js';
import { logger } from '../../utils/logger.js';

/**
 * 計算 MA
 */
const calculateMA = (data, currentIndex, period) => {
  if (currentIndex < period - 1) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[currentIndex - i].close;
  }
  return sum / period;
};

/**
 * 歷史回測引擎核心
 * @param {string} symbol - 股票代號
 * @param {number} years - 回測年數
 * @param {object} strategy - 策略參數 (停損、停利、MA5)
 */
export const runBacktestEngine = async (symbol, years = 3, strategy = {}) => {
  const data = await getHistoricalData(symbol, years);
  
  if (data.length === 0) {
    logger.warn('Backtest Engine', `無歷史資料，無法進行回測: ${symbol}`);
    return null;
  }

  const stopLossPct = strategy.stopLossPct || -7.0;
  const takeProfitPct = strategy.takeProfitPct || 15.0;
  const useMa5Exit = strategy.ma5Exit !== false;

  logger.info('Backtest Engine', `執行回測 ${symbol} | 停損: ${stopLossPct}% | 停利: ${takeProfitPct}% | MA5出場: ${useMa5Exit}`);

  let position = null;
  const trades = [];
  let currentCapital = 1000000; // 假設初始資金 100 萬 (不考慮複利)
  const initialCapital = currentCapital;
  
  let maxCapital = initialCapital;
  let maxDrawdown = 0;

  for (let i = 20; i < data.length; i++) {
    const today = data[i];
    const ma5 = calculateMA(data, i, 5);
    const ma20 = calculateMA(data, i, 20);
    const prevMa20 = calculateMA(data, i - 1, 20);
    
    // 簡單的爆量 + 均線黃金交叉進場策略 (模擬量化條件)
    // 條件：收盤價站上 MA20，且 MA20 向上彎，且成交量大於前一日的 2.5 倍
    if (!position) {
      const prevVolume = data[i - 1].volume || 1;
      const volumeRatio = today.volume / prevVolume;
      
      if (today.close > ma20 && ma20 > prevMa20 && volumeRatio >= 2.5) {
        position = {
          entryPrice: today.close,
          entryDate: today.date,
          highestPrice: today.close
        };
      }
    } 
    // 若有部位，檢查出場條件
    else {
      if (today.high > position.highestPrice) {
        position.highestPrice = today.high;
      }

      let exitPrice = 0;
      let exitReason = '';
      
      // 1. 停損
      const currentProfitPct = ((today.close - position.entryPrice) / position.entryPrice) * 100;
      if (currentProfitPct <= stopLossPct) {
        exitPrice = today.close;
        exitReason = '停損';
      }
      
      // 2. 停利
      if (!exitPrice && currentProfitPct >= takeProfitPct) {
        exitPrice = today.close;
        exitReason = '停利';
      }

      // 3. MA5 跌破 (且已獲利，或者強制保護)
      if (!exitPrice && useMa5Exit && ma5 && today.close < ma5 && currentProfitPct > 0) {
        exitPrice = today.close;
        exitReason = '跌破MA5';
      }

      if (exitPrice > 0) {
        const profit = exitPrice - position.entryPrice;
        const profitPct = (profit / position.entryPrice) * 100;
        
        // 假設固定投入 10萬
        const tradeAmount = 100000;
        const profitAmount = tradeAmount * (profitPct / 100);
        
        currentCapital += profitAmount;
        
        if (currentCapital > maxCapital) {
          maxCapital = currentCapital;
        }
        
        const drawdown = ((maxCapital - currentCapital) / maxCapital) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        trades.push({
          entryDate: position.entryDate,
          entryPrice: position.entryPrice,
          exitDate: today.date,
          exitPrice,
          profitPct,
          profitAmount,
          reason: exitReason
        });
        
        position = null;
      }
    }
  }

  // 結算指標
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.profitPct > 0);
  const losingTrades = trades.filter(t => t.profitPct <= 0);
  
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.profitAmount, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profitAmount, 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : (grossProfit > 0 ? 999 : 0);
  
  const totalReturnPct = ((currentCapital - initialCapital) / initialCapital) * 100;
  const annualizedReturn = ((1 + (totalReturnPct/100)) ** (1/years) - 1) * 100;

  return {
    symbol,
    years,
    totalTrades,
    winRate: winRate.toFixed(1),
    totalReturnPct: totalReturnPct.toFixed(2),
    annualizedReturn: annualizedReturn.toFixed(2),
    maxDrawdown: maxDrawdown.toFixed(2),
    profitFactor: profitFactor.toFixed(2),
    trades
  };
};
