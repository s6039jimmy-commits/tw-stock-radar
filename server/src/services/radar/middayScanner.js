import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';

function generateMiddayRuleBased({ tsePrice, tseChange, tseChangePercent, currentValBillion, estValBillion, tsmcPrice, tsmcChange }) {
  const cPct = parseFloat(tseChangePercent) || 0;

  let style = '【高檔窄幅震盪】';
  let whale = '盤面買賣力道相對均衡，大戶未見急拉急倒，各族群輪動表現。';
  let action = '【觀望】— 原因：大盤窄幅整理方向未明，持股續抱即可，安心吃飯不盲動。';

  if (cPct >= 1.0) {
    style = '【多方強勢控盤】';
    whale = '大戶買盤積極湧入權值與主流股，盤面攻擊力道明確。';
    action = '【加倉】— 原因：大盤突破均線帶量走高，多方攻擊動能強，可逢回分批進場布局強勢股。';
  } else if (cPct <= -2.0) {
    style = '【空方全面殺盤】';
    whale = '盤面出現突發性恐慌拋售，大戶積極避險倒貨，融資賣壓湧現。';
    action = '【賣一點】— 原因：大盤出現恐慌破線殺盤，若手上持股已跌破短期均線，先減碼一部分收回現金避險。';
  } else if (cPct <= -1.0) {
    style = '【空方壓盤下殺】';
    whale = '盤面受外盤拖累賣壓沉重，大戶避險減碼，中小股票跟跌回檔。';
    action = '【觀望】— 原因：盤勢空方壓制賣壓尚未消化完畢，切勿盲目猜底接刀，先保留資金耐心看戲。';
  } else if (cPct < 0) {
    style = '【偏弱震盪整理】';
    whale = '大戶在台積電低檔有防守買盤，但追價意願不高，屬於回檔洗盤。';
    action = '【觀望】— 原因：盤勢處於回檔整理階段，多空仍在拉鋸，手上有持股續抱，暫不急著加碼。';
  }

  return `• 上午盤勢：${style}\n• 大戶動向：${whale}\n• 今日應對：${action}`;
}

export const runMiddayScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('MiddayScan', '🛑 今日為台股休市日／連假，不執行 12:00 午盤快報');
    return false;
  }

  logger.info('MiddayScan', '🍱 執行 12:00 午盤大盤戰況快報掃描...');

  const hasTarget = process.env.LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ACCESS_TOKEN || (process.env.ENABLE_TELEGRAM === 'true' && process.env.TELEGRAM_CHAT_ID);
  if (!hasTarget) {
    logger.warn('MiddayScan', '未設定推播目標 (LINE 或 TG)，跳過 12:00 午盤快報');
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

    const rawVal = tseQuote?.total?.tradeValue || 0;
    const currentValBillion = Math.round(rawVal / 100000000);
    const estValBillion = currentValBillion > 0 ? Math.round(currentValBillion * 1.65) : 0;

    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = generateMiddayRuleBased({ tsePrice, tseChange, tseChangePercent, currentValBillion, estValBillion, tsmcPrice, tsmcChange });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.0 }
        });

        const prompt = `現在是台股盤中 12:00 吃飯時間。
請為老闆產出最簡單、直白、3秒看懂的「12:00 午盤快報」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【上午 12:00 盤面真實數據】：
- 加權指數大盤：${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)
- 上午累積成交金額：約 ${currentValBillion} 億元 (全日預估量約 ${estValBillion} 億元)
- 台積電 (2330)：${tsmcPrice} 元 (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：${honhaiPrice} 元 (${honhaiSign}${honhaiChange}%)

【上午最新盤中快訊】：
${newsText || '暫無突發異常利多利空'}

【必須嚴格遵守的輸出格式】（直接輸出以下三行，嚴禁多餘廢話）：
• 上午盤勢：【多方強勢控盤】（或【空方壓盤下殺】/【無聊窄幅震盪】/【主力拉積掩護出貨】）
• 大戶動向：用一句大白話說明大戶有沒有在偷拉或偷殺（例如：主力拉台積電撐指數，中小股票在偷倒貨 / 全面買單進場追價）。
• 今日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆看。`;

        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (text) aiVerdict = text;
      } catch (geminiError) {
        logger.warn('MiddayScan', 'Gemini API 額度不足或暫時無法連線，啟用智慧型規則引擎產出分析: ' + geminiError.message);
      }
    }

    const html = `🍱 <b>【12:00 午盤大盤戰況】— ${today}</b>

• <b>加權指數：</b><code>${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)</code>
• <b>預估成交量：</b><code>約 ${estValBillion} 億</code>
• <b>台積電現況：</b><code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code>
${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('MiddayScan', `12:00 午盤快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('MiddayScan', '執行 12:00 午盤快報失敗: ' + error.message, error);
    return false;
  }
};
