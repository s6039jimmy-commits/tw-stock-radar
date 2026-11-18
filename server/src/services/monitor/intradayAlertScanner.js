import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { sendHTML } from '../notify/telegram.js';
import { isMarketOpen } from '../../utils/helpers.js';
import { getSetting, setSetting } from '../../db/database.js';

// 本地記憶體快取 (與資料庫雙重加鎖)
const memoryTriggered = new Set();

/**
 * 取得台北時間 YYYY-MM-DD
 */
const getTaipeiDate = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
};

/**
 * 檢查盤中重大波動標的：
 * 1. 台股加權指數 (IX0001) 漲或跌超過 1000 點、2000 點...
 * 2. 富邦台50 (006208) 漲跌超過 1%、2%、3%...
 * 3. 元大高股息 (0056) 漲跌超過 1%、2%、3%...
 * 
 * 核心鐵則：
 * - 僅在開盤到結盤之間 (09:00 - 13:30) 且為交易日時觸發
 * - 【階梯擴大提醒】：達到 1% 跳一次；若後續跌幅/漲幅進一步擴大達到 2%，再跳一次提醒！
 * - 每一階梯當日最多只推播 1 次，在階梯內來回震盪時絕不重複推播！
 * - 狀態寫入資料庫持久化，即使伺服器重啟或雲端部署，已推播過的階梯也絕不重複推播！
 */
export const checkIntradayAlerts = async (forceCheck = false) => {
  if (!forceCheck && !isMarketOpen()) {
    return;
  }

  const today = getTaipeiDate();

  // 特殊保護：今日 (2026-11-18) 0056 跌破 1% 早盤已推播過，嚴防重啟後重跳 1%
  if (today === '2026-11-18') {
    memoryTriggered.add('INTRADAY_ALERT_2026-11-18_0056_DOWN_1');
  }

  // 1. 監控台股加權指數 (IX0001) - 階梯門檻：每 1000 點
  try {
    const marketQuote = await getQuote('IX0001');
    if (marketQuote) {
      const price = marketQuote.closePrice || marketQuote.lastPrice || 0;
      const change = parseFloat(marketQuote.change || 0);
      const changePct = parseFloat(marketQuote.changePercent || 0);
      const absChange = Math.abs(change);

      if (absChange >= 1000) {
        const direction = change >= 0 ? 'UP' : 'DOWN';
        const tier = Math.floor(absChange / 1000); // 1, 2, 3...
        const alertKey = `INTRADAY_ALERT_${today}_IX0001_${direction}_${tier}`;
        const alreadyTriggered = memoryTriggered.has(alertKey) || (await getSetting(alertKey));

        if (!alreadyTriggered) {
          memoryTriggered.add(alertKey);
          await setSetting(alertKey, new Date().toISOString());

          const sign = change >= 0 ? '+' : '';
          const actionText = change >= 0 ? '暴漲' : '重挫';
          const pointsThreshold = tier * 1000;
          
          let titlePrefix = '【盤中即時巨震快報】';
          let icon = change >= 0 ? '🚀' : '🚨';
          if (tier >= 2) {
            titlePrefix = '🚨【盤中波動加劇快報】';
            icon = change >= 0 ? '🔥' : '💥';
          }

          const html = `${icon} <b>${titlePrefix}台股大盤${actionText}逾 ${pointsThreshold} 點！</b>\n\n` +
            `• <b>監控標的</b>：台股加權指數 (IX0001)\n` +
            `• <b>即時點位</b>：${price.toLocaleString()} 點\n` +
            `• <b>今日漲跌</b>：<b>${sign}${change.toFixed(0)} 點 (${sign}${changePct.toFixed(2)}%)</b>`;

          logger.info('IntradayAlert', `📢 觸發加權指數波動推播 (${tier * 1000}點階梯): ${sign}${change} 點`);
          await sendHTML(html);
        }
      }
    }
  } catch (err) {
    logger.warn('IntradayAlert', '檢查大盤指數波動失敗: ' + err.message);
  }

  // 2. 監控 006208 與 0056 - 階梯門檻：每 1% (1% 跳一次，擴大到 2% 再跳一次...)
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

      // 門檻：漲跌幅達標 (>= 1.0%)
      if (absChangePct >= 1.0) {
        const direction = changePct >= 0 ? 'UP' : 'DOWN';
        const tier = Math.floor(absChangePct); // 1, 2, 3...
        const alertKey = `INTRADAY_ALERT_${today}_${target.symbol}_${direction}_${tier}`;
        const alreadyTriggered = memoryTriggered.has(alertKey) || (await getSetting(alertKey));

        // 該階梯今日已推播過，跳過不重複打擾
        if (alreadyTriggered) continue;

        // 雙重加鎖：立即寫入記憶體與資料庫防重鎖
        memoryTriggered.add(alertKey);
        await setSetting(alertKey, new Date().toISOString());

        const sign = change >= 0 ? '+' : '';
        const actionType = changePct >= 0 ? '漲幅' : '跌幅';
        
        let title = '';
        let icon = '';
        if (tier === 1) {
          icon = changePct >= 0 ? '📈' : '📉';
          title = `<b>【盤中重大波動快報】${target.name} ${actionType}破 1%！</b>`;
        } else if (tier === 2) {
          icon = changePct >= 0 ? '🚀' : '⚠️';
          title = `<b>【盤中波動加劇快報】${target.name} ${actionType}擴大逾 2%！</b>`;
        } else {
          icon = changePct >= 0 ? '🔥' : '🚨';
          title = `<b>【盤中極端行情警報】${target.name} ${actionType}劇震逾 ${tier}%！</b>`;
        }

        const html = `${icon} ${title}\n\n` +
          `• <b>監控標的</b>：${target.name}\n` +
          `• <b>即時報價</b>：NT$ ${price}\n` +
          `• <b>今日漲跌</b>：<b>${sign}${change} (${sign}${changePct.toFixed(2)}%)</b>`;

        logger.info('IntradayAlert', `📢 觸發 ${target.symbol} ${tier}% 階梯推播: ${sign}${changePct}%`);
        await sendHTML(html);
      }
    } catch (err) {
      logger.warn('IntradayAlert', `檢查 ${target.symbol} 失敗: ` + err.message);
    }
  }
};
