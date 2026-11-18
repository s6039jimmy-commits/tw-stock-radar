import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { sendHTML } from '../notify/telegram.js';
import { isMarketOpen } from '../../utils/helpers.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 盤中每日警報已發送紀錄（每日換日自動清空）
let alertHistory = {
  date: '',
  // 記錄已通知標的與方向: { 'IX0001_UP': timestamp, '006208_DOWN_1': timestamp, ... }
  triggered: new Set()
};

/**
 * 取得台北時間 YYYY-MM-DD
 */
const getTaipeiDate = () => {
  return new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
};

/**
 * 每日換日重置防重複紀錄
 */
const resetIfNewDay = () => {
  const today = getTaipeiDate();
  if (alertHistory.date !== today) {
    alertHistory.date = today;
    alertHistory.triggered.clear();
    logger.info('IntradayAlert', `🔄 已重置盤中監控警報狀態 (${today})`);
  }
};

/**
 * 檢查盤中重大波動標的：
 * 1. 台股加權指數 (IX0001) 漲或跌超過 1000 點
 * 2. 富邦台50 (006208) 漲跌超過 1%
 * 3. 元大高股息 (0056) 漲跌超過 1%
 * 限制：僅在開盤到結盤之間 (09:00 - 13:30) 且為交易日時觸發
 */
export const checkIntradayAlerts = async (forceCheck = false) => {
  if (!forceCheck && !isMarketOpen()) {
    return;
  }

  resetIfNewDay();
  const now = Date.now();

  // 1. 監控台股加權指數 (IX0001)
  try {
    const marketQuote = await getQuote('IX0001');
    if (marketQuote) {
      const price = marketQuote.closePrice || marketQuote.lastPrice || 0;
      const change = parseFloat(marketQuote.change || 0);
      const changePct = parseFloat(marketQuote.changePercent || 0);
      const absChange = Math.abs(change);

      // 門檻：漲跌超過 1000 點
      if (absChange >= 1000) {
        const direction = change >= 0 ? 'UP' : 'DOWN';
        const alertKey = `IX0001_${direction}_1000`;

        if (!alertHistory.triggered.has(alertKey)) {
          alertHistory.triggered.add(alertKey);

          const sign = change >= 0 ? '+' : '';
          const actionText = change >= 0 ? '暴漲' : '重挫';
          const icon = change >= 0 ? '🚀' : '🚨';

          const html = `${icon} <b>【盤中即時巨震快報】台股大盤${actionText}逾千點！</b>\n\n` +
            `• <b>監控標的</b>：台股加權指數 (IX0001)\n` +
            `• <b>即時點位</b>：${price.toLocaleString()} 點\n` +
            `• <b>今日漲跌</b>：<b>${sign}${change.toFixed(0)} 點 (${sign}${changePct.toFixed(2)}%)</b>`;

          logger.info('IntradayAlert', `📢 觸發加權指數波動推播: ${sign}${change} 點`);
          await sendHTML(html);
        }
      }
    }
  } catch (err) {
    logger.warn('IntradayAlert', '檢查大盤指數波動失敗: ' + err.message);
  }

  // 2. 監控 006208 與 0056 (漲跌超過 1%)
  const etfTargets = [
    { symbol: '006208', name: '富邦台灣50 (006208)' },
    { symbol: '0056', name: '元大高股息 (0056)' }
  ];

  for (const target of etfTargets) {
    try {
      const quote = await getQuote(target.symbol);
      if (!quote) continue;

      const price = quote.closePrice || quote.lastPrice || 0;
      const change = parseFloat(quote.change || 0);
      const changePct = parseFloat(quote.changePercent || 0);
      const absChangePct = Math.abs(changePct);

      // 門檻：漲跌幅超過 1.0%
      if (absChangePct >= 1.0) {
        const direction = changePct >= 0 ? 'UP' : 'DOWN';
        // 級距分層：1%, 2%, 3% 防止洗版但不錯過擴大
        const tier = Math.floor(absChangePct);
        const alertKey = `${target.symbol}_${direction}_${tier}`;

        if (!alertHistory.triggered.has(alertKey)) {
          alertHistory.triggered.add(alertKey);

          const sign = change >= 0 ? '+' : '';
          const actionText = changePct >= 0 ? '強勢上漲' : '大幅回檔';
          const icon = changePct >= 0 ? '📈' : '📉';

          const html = `${icon} <b>【盤中重大波動快報】${target.name} 漲跌破 1%！</b>\n\n` +
            `• <b>監控標的</b>：${target.name}\n` +
            `• <b>即時報價</b>：NT$ ${price}\n` +
            `• <b>今日漲跌</b>：<b>${sign}${change} (${sign}${changePct.toFixed(2)}%)</b>`;

          logger.info('IntradayAlert', `📢 觸發 ${target.symbol} 波動推播: ${sign}${changePct}%`);
          await sendHTML(html);
        }
      }
    } catch (err) {
      logger.warn('IntradayAlert', `檢查 ${target.symbol} 失敗: ` + err.message);
    }
  }
};
