import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * ☀️ 08:40 盤前試撮與開盤預估快報
 * 使用者要求：
 * 1. 早上 08:40 開始搓合時發送
 * 2. 預估今天加權指數漲還是跌、開高還是開低
 * 3. 解釋原因「不用太難要我能懂」（老闆秒懂大白話風格）
 * 4. 雙層架構：
 *    - 上半段（給你秒懂）：預估開盤方向、今天漲跌、原因白話一句話、早盤行動方針
 *    - 下半段（給朋友看門道）：美股/ADR/輝達昨晚數據、早盤量能觀察重點與防守點位
 * 5. 開盤日週一至週五發送，假日休市絕不發送
 */
export const runPreMarketScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('PreMarket', '🛑 今日為台股休市日／連假，不執行 08:40 盤前快報');
    return false;
  }

  logger.info('PreMarket', '🌅 執行 08:40 盤前試撮與開盤預估快報掃描...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('PreMarket', '未設定 TELEGRAM_CHAT_ID，跳過 08:40 推播');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    // 獲取隔夜美股與 ADR 數據
    const [tsmQuote, nvdaQuote, soxQuote, news, tseQuote, tsmcQuote] = await Promise.all([
      yahooFinance.quote('TSM').catch(() => null),
      yahooFinance.quote('NVDA').catch(() => null),
      yahooFinance.quote('^SOX').catch(() => null),
      fetchLatestStockNews(6),
      getQuote('IX0001'),
      getQuote('2330')
    ]);

    const tsmPrice = tsmQuote?.regularMarketPrice || 0;
    const tsmChange = parseFloat(tsmQuote?.regularMarketChangePercent || 0).toFixed(2);
    const tsmSign = parseFloat(tsmChange) >= 0 ? '+' : '';

    const nvdaPrice = nvdaQuote?.regularMarketPrice || 0;
    const nvdaChange = parseFloat(nvdaQuote?.regularMarketChangePercent || 0).toFixed(2);
    const nvdaSign = parseFloat(nvdaChange) >= 0 ? '+' : '';

    const soxPrice = soxQuote?.regularMarketPrice || 0;
    const soxChange = parseFloat(soxQuote?.regularMarketChangePercent || 0).toFixed(2);
    const soxSign = parseFloat(soxChange) >= 0 ? '+' : '';

    const tsePrevClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tsmcPrevClose = tsmcQuote?.closePrice || tsmcQuote?.lastPrice || 0;

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '盤前研判：美股震盪，預估今日台股平盤附近開出，維持既有持股。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度，不胡扯
        }
      });

      const prompt = `你是一位講話極度直白、實戰經驗豐富的台股頂尖老手操盤人。
現在是台灣時間早上 08:40，台股進入委託試撮階段（08:45 台指期即將開盤、09:00 現貨開盤）：

【昨夜美股與隔夜指標真實收盤】：
- 台積電 ADR (TSM)：收盤 ${tsmPrice} 美元 (${tsmSign}${tsmChange}%)
- 輝達 (NVDA)：收盤 ${nvdaPrice} 美元 (${nvdaSign}${nvdaChange}%)
- 費城半導體指數 (^SOX)：收盤 ${soxPrice} 點 (${soxSign}${soxChange}%)
- 台股昨收基準：加權指數昨收 ${tsePrevClose} 點，台積電昨收 ${tsmcPrevClose} 元

【今晨重要財經頭條】：
${newsText || '暫無突發重大新聞'}

【任務要求】：
請為投資人產出「08:40 盤前試撮與開盤預估快報」。
【重點要求】：解釋「不用太難要我能懂」，講大白話，讓老闆一眼秒懂為什麼會漲或跌；同時讓懂很多的朋友看到關鍵依據！

【必須遵守的格式】（嚴禁多餘廢話，直接輸出）：
☀️ 【上半段：給你秒懂】
• 開盤預估：【預估開高衝鋒】（或【預估開低震盪】/【平盤附近開出】）
• 今天預估漲還是跌：【看漲】（或【看跌】/【高檔震盪】/【多空拉鋸】）
• 原因大白話（不用太難、一眼看懂）：用 1~2 句最簡單好懂的話解釋為什麼（例如：昨晚美股費半與台積電 ADR 大漲，外資今天開盤一定會順勢拉抬台股開高）。
• 早盤行動一句話：最直白的應對動作（例如：開盤若急拉切勿盲目追價，等 09:30 盤勢沉澱 / 逢回不恐慌）。

🔍 【下半段：給朋友看門道】
1. 隔夜外盤連動解讀：用 2 句老實話剖析台積電 ADR (${tsmSign}${tsmChange}%) 與費半走勢對今天台股開盤的實質溢價影響。
2. 早盤關鍵觀察：提示 09:00 開盤後前 30 分鐘，朋友該盯緊的關鍵防守點或成交量能特徵。

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分析個別小型投機股。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `☀️ <b>【08:40 盤前試撮與開盤預估】— ${today}</b>

<b>🌐 隔夜外盤關鍵指標：</b>
• <b>台積電 ADR：</b><code>${tsmPrice} USD (${tsmSign}${tsmChange}%)</code>
• <b>輝達 (NVDA)：</b><code>${nvdaPrice} USD (${nvdaSign}${nvdaChange}%)</code>
• <b>費半指數 (^SOX)：</b><code>${soxPrice} (${soxSign}${soxChange}%)</code>
• <b>台股昨收點位：</b><code>加權 ${tsePrevClose} 點 | 台積電 ${tsmcPrevClose} 元</code>

<b>🔮 開盤老手預估：</b>
<pre>${aiVerdict}</pre>`;

    const ok = await sendHTML(html);
    logger.info('PreMarket', `08:40 盤前快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('PreMarket', '執行 08:40 盤前快報失敗: ' + error.message, error);
    return false;
  }
};
