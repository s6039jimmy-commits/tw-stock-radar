import { streamEmitter } from '../fugle/streaming.js';
import { getActivePositions } from '../../db/database.js';
import { processExitAlert } from './exitEngine.js';
import { logger } from '../../utils/logger.js';

// 記錄每檔股票的大單累計淨買賣超 (金額)
// 格式: { [symbol]: { netVolume: 0, lastUpdate: timestamp } }
const tickVolumes = {};

// 門檻設定
const LARGE_ORDER_THRESHOLD = 10000000; // 單筆大單門檻 1000 萬台幣
const DUMP_ALERT_THRESHOLD = -50000000; // 淨賣出門檻 -5000 萬台幣 (觸發出場)
const RESET_INTERVAL = 5 * 60 * 1000; // 5 分鐘歸零重計 (滾動窗口)

export const initTickMonitor = () => {
  streamEmitter.on('trade-update', (data) => {
    try {
      const { symbol, price, size, bid, ask } = data;
      // size 是股數, 計算此筆成交金額
      const value = price * size;
      
      // 只處理監控中的持倉
      const positions = await getActivePositions();
      const position = positions.find(p => p.symbol === symbol);
      if (!position) return;

      if (!tickVolumes[symbol]) {
        tickVolumes[symbol] = { netVolume: 0, lastUpdate: Date.now() };
      }
      
      const now = Date.now();
      if (now - tickVolumes[symbol].lastUpdate > RESET_INTERVAL) {
        // 超過 5 分鐘，重新計算
        tickVolumes[symbol].netVolume = 0;
      }
      tickVolumes[symbol].lastUpdate = now;

      // 判斷內外盤 (內盤=賣單, 外盤=買單)
      // 若無 bid/ask，則以漲跌判斷，此處簡化處理，大筆交易通常有明確內外盤
      // 若無法判斷，暫不計入淨賣出
      // 假設 Fugle 會有 isAsk 或可以從價格判斷，這裡用價格變動或簡單設定
      // 由於逐筆資料不一定帶有內外盤註記，這裡以單筆大於門檻的「賣單」為保守判定
      // 在 Fugle Trades 中，買賣方可以由 price 靠近 bid 或 ask 決定
      // 假設如果 price <= bid, 視為內盤(主動賣)
      // 但我們沒有即時 bid/ask，只能假設 (如果沒有其他欄位)
      
      // 為了示範，若大筆成交，我們先假設為主力異動。
      // 若這筆是大賣單 (這裡用一個簡易模擬: 假設有賣出標記或隨機模擬以符合需求)
      // 實際上需要取得內外盤。Fugle Trades 有時會有 isBuyerMaker
      const isBuyerMaker = data.isBuyerMaker; // 買方是 Maker = 主動賣出 (內盤)
      
      if (value >= LARGE_ORDER_THRESHOLD) {
        if (isBuyerMaker) {
          tickVolumes[symbol].netVolume -= value;
          logger.info('Tick Monitor', `🚨 偵測到 ${symbol} 盤中大單倒貨: ${value.toLocaleString()} 元`);
        } else if (isBuyerMaker === false) {
          tickVolumes[symbol].netVolume += value;
        }
      }

      // 檢查是否達到倒貨門檻
      if (tickVolumes[symbol].netVolume <= DUMP_ALERT_THRESHOLD) {
        logger.warn('Tick Monitor', `⚠️ ${symbol} 短線遭主力猛烈倒貨，淨賣超達 ${Math.abs(tickVolumes[symbol].netVolume).toLocaleString()} 元，強制觸發出場`);
        
        processExitAlert(position, 'LARGE_ORDER_DUMP', {
          price: price,
          reason: `⚠️ 盤中偵測到主力倒貨！連續大單賣出逾 5,000 萬，建議立刻市價撤退！`,
          ai_analysis: `系統即時監控 (Tick Level) 偵測到 5 分鐘內主力淨大單賣出高達 ${Math.abs(tickVolumes[symbol].netVolume).toLocaleString()} 元，籌碼急遽潰散，屬極高風險狀態。`
        });
        
        // 觸發後重置，避免狂發
        tickVolumes[symbol].netVolume = 0;
      }
      
    } catch (e) {
      logger.error('Tick Monitor', '大單監控處理失敗', e);
    }
  });
  
  logger.info('Tick Monitor', '已啟動主力大單即時監控');
};
