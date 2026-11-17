import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';

/**
 * 🍱 11:30 午盤快報（一天只發一次）
 * 依使用者最新要求：
 * 1. 專屬個人秒懂版，不需要下半段朋友分析，不分上下段
 * 2. 移除任何「老手」自稱或花俏抬頭
 * 3. 3秒看懂：指數現況、預估量、大戶偷拉偷殺、下午應對一句話
 * 4. 正常交易日週一至週五發送，連假休市絕不推播
 */
export const runMiddayScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('MiddayScan', '🛑 今日為台股休市日／連假，不執行 11:30 午盤快報');
    return false;
  }

  logger.info('MiddayScan', '🍱 執行 11:30 午盤大盤戰況快報掃描...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('MiddayScan', '未設定 TELEGRAM_CHAT_ID，跳過 11:30 午盤快報');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tseQuote, tsmcQuote, honhaiQuote, mtkQuote, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('2330'),
      getQuote('2317'),
      getQuote('2454'),
      fetchLatestStockNews(8)
    ]);

    const tsePrice = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.change || 0);
    const tseChangePercent = parseFloat(tseQuote?.changePercent || 0);
    const tseSign = tseChange >= 0 ? '+' : '';

    // 成交量與預估量計算
    const rawVal = tseQuote?.total?.tradeValue || 0;
    const currentValBillion = Math.round(rawVal / 100000000);
    const estValBillion = currentValBillion > 0 ? Math.round(currentValBillion * 1.65) : 0;

    // 權值股動態
    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '• 上午盤勢：【震盪整理】\n• 大戶動向：盤面買賣力道均衡，無異常急拉急殺。\n• 下午應對：安心吃飯，持股續抱不動。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度
        }
      });

      const prompt = `現在是台股盤中 11:30 吃飯時間。
請為老闆產出最簡單、直白、3秒看懂的「11:30 午盤快報」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【上午 11:30 盤面真實數據】：
- 加權指數大盤：${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)
- 上午累積成交金額：約 ${currentValBillion} 億元 (全日預估量約 ${estValBillion} 億元)
- 台積電 (2330)：${tsmcPrice} 元 (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：${honhaiPrice} 元 (${honhaiSign}${honhaiChange}%)

【上午最新盤中快訊】：
${newsText || '暫無突發異常利多利空'}

【必須嚴格遵守的輸出格式】（嚴禁多餘廢話、前言、結尾或任何「老手」稱呼，直接輸出以下三行）：
• 上午盤勢：【多方強勢控盤】（或【空方壓盤下殺】/【無聊窄幅震盪】/【主力拉積掩護出貨】）
• 大戶動向：用一句大白話說明大戶有沒有在偷拉或偷殺（例如：主力拉台積電撐指數，中小股票在偷倒貨 / 全面買單進場追價）。
• 今日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因（例如：【觀望】— 原因：目前上下震幅過小無成交量，多看少做不盲動；或【賣一點】— 原因：上午大盤逢高遇壓無力突破，可適度收回部分資金；或【加倉】— 原因：特定買盤逢低吃貨力道強勁，可逢回分批進場）。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆看。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🍱 <b>【11:30 午盤大盤戰況】— ${today}</b>

• <b>加權指數：</b><code>${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)</code>
• <b>預估成交量：</b><code>約 ${estValBillion} 億</code>
• <b>台積電現況：</b><code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code>
${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('MiddayScan', `11:30 午盤快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('MiddayScan', '執行 11:30 午盤快報失敗: ' + error.message, error);
    return false;
  }
};
