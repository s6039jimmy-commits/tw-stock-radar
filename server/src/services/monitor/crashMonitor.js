import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { sendHTML } from '../notify/telegram.js';
import { isMarketOpen, isTradingDay } from '../../utils/helpers.js';

/**
 * 🚨 選擇 C：【緊急防護】大盤大暴跌才叫（平常安靜，有大事才警報）
 * 特色：
 * 1. 平常完全不吵！只有當天加權指數突發暴跌超過 1.5%（重挫 300~400 點）時，在群組緊急響一聲
 * 2. 防洗版與重複警報機制：
 *    - 同一交易日跌破 1.5% 只響一次，絕不重複轟炸
 *    - 除非跌勢進一步大幅惡化突破 2.5%（極端崩跌），才會發出二次重大警報
 *    - 收盤或跨日自動重設狀態
 */

let lastAlertDate = null;
let triggeredLevels = new Set(); // 記錄當日已觸發之警報級距 (1: 跌破 1.5%, 2: 跌破 2.5%)

export const checkMarketCrash = async (force = false) => {
  // 檢查是否開盤中（手動測試時可 force = true 跳過檢查）
  if (!force) {
    if (!isTradingDay() || !isMarketOpen()) {
      return false;
    }
  }

  const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  if (lastAlertDate !== todayStr) {
    lastAlertDate = todayStr;
    triggeredLevels.clear();
  }

  try {
    const tseQuote = await getQuote('IX0001');
    if (!tseQuote) return false;

    const tsePrice = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.change || 0);
    const tseChangePercent = parseFloat(tseQuote?.changePercent || 0);

    // 判斷是否達到暴跌門檻：跌幅 >= 1.5% (即 changePercent <= -1.5) 或 跌點 >= 350 點
    const isLevel1 = (tseChangePercent <= -1.5) || (tseChange <= -350);
    const isLevel2 = (tseChangePercent <= -2.5) || (tseChange <= -600);

    if (!isLevel1 && !force) {
      // 正常波動，保持完全安靜
      return false;
    }

    let alertLevel = 0;
    let levelTitle = '';
    if (isLevel2 && !triggeredLevels.has(2)) {
      alertLevel = 2;
      levelTitle = '🔥 【極端崩跌警報】加權指數跌幅擴大破 2.5%！';
    } else if (isLevel1 && !triggeredLevels.has(1)) {
      alertLevel = 1;
      levelTitle = '🚨 【緊急防護警報】加權指數盤中突發重挫！';
    } else if (force) {
      alertLevel = 1;
      levelTitle = '🚨 【緊急防護警報 - 模擬測試】加權指數盤中突發重挫！';
    } else {
      // 當天該級距已報過，不重複洗版
      return false;
    }

    // 獲取權值股最新災情
    const [tsmcQuote, honhaiQuote] = await Promise.all([
      getQuote('2330'),
      getQuote('2317')
    ]);

    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const rawVal = tseQuote?.total?.tradeValue || 0;
    const currentValBillion = Math.round(rawVal / 100000000);

    const html = `${levelTitle}

⚠️ <b>大盤今天有突發殺盤，注意持股風險！</b>

<b>🩸 即時盤面災情：</b>
• <b>加權指數：</b><code>${tsePrice} 點 (重挫 ${tseChange} 點 / ${tseChangePercent}%)</code>
• <b>台積電 (2330)：</b><code>${tsmcPrice} 元 (${tsmcSign}${tsmcChange}%)</code>
• <b>鴻海 (2317)：</b><code>${honhaiPrice} 元 (${honhaiSign}${honhaiChange}%)</code>
• <b>盤面成交額：</b><code>累積約 ${currentValBillion} 億元</code>

<b>🛡️ 老手緊急避險指引：</b>
<pre>
1. 盤面出現突發性恐慌倒貨，切勿急著進場「盲目猜底接刀」！
2. 弱勢或已破短期均線的持股切勿凹單加碼。
3. 靜待午後 13:00 是否有特定國家隊或權值買盤收腳防守，或等待 14:05 盤後完整籌碼結算。
</pre>`;

    const ok = await sendHTML(html);
    if (ok && alertLevel > 0) {
      triggeredLevels.add(alertLevel);
      logger.info('CrashMonitor', `已發送加權指數暴跌警報 (Level ${alertLevel}) 至 Telegram`);
    }
    return ok;
  } catch (error) {
    logger.error('CrashMonitor', '檢查大盤暴跌失敗: ' + error.message, error);
    return false;
  }
};

/**
 * 測試緊急防護警報（模擬當前數據直接推播一則警報至群組）
 */
export const testCrashAlert = async () => {
  logger.info('CrashMonitor', '🧪 執行緊急防護大暴跌警報模擬測試...');
  return checkMarketCrash(true);
};
