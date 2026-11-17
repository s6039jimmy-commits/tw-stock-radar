import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay, getMarketHolidayAlerts } from '../../utils/helpers.js';

/**
 * 🎯 14:05 盤後大盤明日預測
 * 依使用者最新要求：
 * 1. 專屬個人秒懂版，不需要下半段朋友分析，不分上下段
 * 2. 移除任何「老手」自稱或花俏抬頭
 * 3. 3秒看懂：明日漲跌、0056/006208現況、能不能追、明日應對一句話
 * 4. 前一天提前公告台股與美股節日休市
 * 5. 正常交易日週一至週五發送，連假休市絕不推播
 */
export const runPostMarketScan = async () => {
  // 檢查是否為台股正常交易日（國定假日、連假、颱風假休市絕不推播）
  if (!isTradingDay()) {
    logger.info('PostMarket', '🛑 今日為台股休市日／連假，不執行 14:05 推播');
    return;
  }

  logger.info('PostMarket', '📊 執行 14:05 大盤明日漲跌預測推播...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('PostMarket', '未設定 Telegram，跳過 14:05 推播');
    return;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [q56, q6208, tseQuote, tsmcQuote, honhaiQuote, news] = await Promise.all([
      getQuote('0056'),
      getQuote('006208'),
      getQuote('IX0001'),
      getQuote('2330'),
      getQuote('2317'),
      fetchLatestStockNews(10)
    ]);

    const price56 = q56?.closePrice || q56?.lastPrice || 0;
    const change56 = parseFloat(q56?.changePercent || q56?.change || 0);
    const sign56 = change56 >= 0 ? '+' : '';

    const price6208 = q6208?.closePrice || q6208?.lastPrice || 0;
    const change6208 = parseFloat(q6208?.changePercent || q6208?.change || 0);
    const sign6208 = change6208 >= 0 ? '+' : '';

    const tseClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.changePercent || tseQuote?.change || 0);
    const tseSign = tseChange >= 0 ? '+' : '';
    const rawVal = tseQuote?.total?.tradeValue || 0;
    const tseValBillion = Math.round(rawVal / 100000000);

    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    // 檢查明日台股或美股是否有休市（提前在 14:05 預告）
    const holidayAlerts = getMarketHolidayAlerts();
    let holidaySection = '';
    if (holidayAlerts.length > 0) {
      holidaySection = '\n' + holidayAlerts.join('\n') + '\n';
    }

    let aiVerdict = '• 明天到底會漲還是跌：【高檔震盪】\n• 0056 / 006208 現況：表現平穩，區間整理。\n• 能不能追：【續抱不動，切勿追高】\n• 明日應對：維持既有部位，回檔再行考慮。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度
        }
      });

      const prompt = `今日台股盤後數據已正式結算。
請為老闆產出最簡單、直白、3秒看懂的「14:05 大盤明日預測」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【今日收盤真實數據】：
- 加權指數大盤：收盤 ${tseClose} 點 (${tseSign}${tseChange}%)，成交量約 ${tseValBillion} 億元
- 0056 (元大高股息)：收盤價 NT$ ${price56} (${sign56}${change56}%)
- 006208 (富邦台50)：收盤價 NT$ ${price6208} (${sign6208}${change6208}%)
- 台積電 (2330)：收盤價 NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：收盤價 NT$ ${honhaiPrice} (${honhaiSign}${honhaiChange}%)

【今日重大財經要聞】：
${newsText}

【必須嚴格遵守的輸出格式】（嚴禁多餘廢話、前言、結尾或任何「老手」稱呼，直接輸出以下四行）：
• 明天到底會漲還是跌：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）
• 0056 / 006208 現況：用一句大白話總結這兩檔今天表現與強弱
• 能不能追：【不可追，等拉回】（或【可以逢低分批買】/【續抱不動，切勿追高】/【反彈減碼】）
• 明日應對：用一句話直接給老闆明確動作叮嚀

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆秒懂。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🎯 <b>【14:05 大盤明日預測】— ${today}</b>

<b>📌 今日收盤概況：</b>
• <b>加權指數：</b><code>${tseClose} 點 (${tseSign}${tseChange}%) | 成交約 ${tseValBillion} 億</code>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>台積電：</b><code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code>
${holidaySection}
${aiVerdict}`;

    await sendHTML(html);
    logger.info('PostMarket', '✅ 14:05 大盤明日預測推播發送完成');
  } catch (e) {
    logger.error('PostMarket', '14:05 推播失敗: ' + e.message, e);
  }
};