import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchTopHeadlines } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';
import { LINE_CHANNEL_ID } from '../../config/index.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function generatePreMarketRuleBased({ soxChange, tsmChange, tsePrevClose, topNewsTitle }) {
  const soxVal = parseFloat(soxChange) || 0;
  const tsmVal = parseFloat(tsmChange) || 0;

  let openDir = '【平盤附近開出】';
  let trend = '【高檔震盪】';
  let reason = topNewsTitle ? `市場焦點關注「${topNewsTitle}」，隔夜外盤維持平盤整理，開盤回歸本土節奏。` : '隔夜美股平盤整理，外盤缺乏強勁推力，台股開盤回歸本土盤面節奏。';
  let action = '【建議持股續抱，空手不建議追高】— 原因：目前盤前缺乏明確突破訊號，先看開盤後半小時量能變化，空手不急著躁進。';

  if (soxVal <= -2.5 || tsmVal <= -3.0) {
    openDir = '【預估開低震盪】';
    trend = '【看跌】';
    reason = topNewsTitle 
      ? `受「${topNewsTitle}」重大利空衝擊，昨晚費半 (${soxChange}%) 與台積電 ADR (${tsmChange}%) 重挫，引爆沉重賣壓。`
      : `外盤受重大利空打擊，費半 (${soxChange}%) 與台積電 ADR (${tsmChange}%) 重挫，開盤將承受沉重賣壓。`;
    action = '【明確不建議進場追價接刀】— 原因：外盤科技股重挫賣壓未消，開盤先不要慌著亂砍，等 09:30 前看有無買盤進場收腳，切勿盲目接刀。';
  } else if (soxVal >= 2.0 || tsmVal >= 2.5) {
    openDir = '【預估開高衝鋒】';
    trend = '【看漲】';
    reason = topNewsTitle
      ? `受「${topNewsTitle}」利多激勵，昨晚美股費半大漲 (${soxChange}%)，台積電 ADR 勁揚 (${tsmChange}%)，帶動多頭氣勢。`
      : `昨晚美股費半強彈 (${soxChange}%)，台積電 ADR 勁揚 (${tsmChange}%)，外資開盤勢必順勢拉抬權值股帶動大盤衝高。`;
    action = '【明確建議逢回加碼買進】— 原因：外盤強勢激勵台股早盤多方動能，若手中持股拉回均線有撐，建議逢低分批加碼。';
  } else if (soxVal < 0) {
    openDir = '【預估開平走低】';
    trend = '【震盪偏弱】';
    reason = topNewsTitle
      ? `市場關注「${topNewsTitle}」，外盤動能偏弱，台股開盤預計先在昨收 (${tsePrevClose} 點) 附近震盪消化賣壓。`
      : `美股小幅回檔整理，外盤動能疲軟，台股開盤預計先在昨收 (${tsePrevClose} 點) 附近震盪消化賣壓。`;
    action = '【暫不建議進場追價，以防守為主】— 原因：盤前方向性偏弱，先看現貨開盤後主流族群能否抗跌，空手保留資金。';
  }

  return `• 開盤預估：${openDir}\n• 今天預估漲跌：${trend}\n• 核心驅動原因：${reason}\n• 今日應對：${action}`;
}

export const runPreMarketScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('PreMarket', '🛑 今日為台股休市日／連假，不執行 08:40 盤前快報');
    return false;
  }

  logger.info('PreMarket', '🌅 執行 08:40 盤前試撮與開盤預估快報掃描...');

  const hasTarget = LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ACCESS_TOKEN || (process.env.ENABLE_TELEGRAM === 'true' && process.env.TELEGRAM_CHAT_ID);
  if (!hasTarget) {
    logger.warn('PreMarket', '未設定推播目標 (LINE 或 TG)，跳過 08:40 推播');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tsmQuote, nvdaQuote, soxQuote, news, tseQuote, tsmcQuote] = await Promise.all([
      yahooFinance.quote('TSM').catch(() => null),
      yahooFinance.quote('NVDA').catch(() => null),
      yahooFinance.quote('^SOX').catch(() => null),
      fetchTopHeadlines(10),
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

    let aiVerdict = generatePreMarketRuleBased({ soxChange, tsmChange, tsePrevClose, topNewsTitle: news?.[0]?.title });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `現在是台灣時間早上 08:40，台股進入委託試撮階段（08:45 台指期開盤、09:00 現貨開盤）。
請為老闆產出最簡單、直白、3秒看懂的「08:40 開盤預估」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【昨夜美股與隔夜指標真實收盤】：
- 台積電 ADR (TSM)：收盤 ${tsmPrice} 美元 (${tsmSign}${tsmChange}%)
- 輝達 (NVDA)：收盤 ${nvdaPrice} 美元 (${nvdaSign}${nvdaChange}%)
- 費城半導體指數 (^SOX)：收盤 ${soxPrice} 點 (${soxSign}${soxChange}%)
- 台股昨收基準：加權指數昨收 ${tsePrevClose} 點，台積電昨收 ${tsmcPrevClose} 元

【今晨重要財經頭條與政經事件】：
${newsText || '暫無突發重大新聞'}

【必須嚴格遵守的輸出格式】（直接輸出以下四行，嚴禁多餘廢話）：
• 開盤預估：【預估開高】（或【預估開低】/【平盤附近開出】）
• 今天預估漲跌：【看漲】（或【看跌】/【高檔震盪】/【多空拉鋸】）
• 核心驅動原因：【絕對嚴格禁止只講技術面均線破線、技術回檔等空話！】必須結合今晨重要財經頭條與政經事件，用 1~2 句大白話直接講出隔夜外圍最真實的「消息/事件元兇」（例如：川普突發關稅震撼彈重擊供應鏈、Fed利率決策變數、重大財報公布等），直球講出真因！
• 今日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 絕對禁止在「核心驅動原因」中只講技術面名詞（如破均線、月線有撐、技術性回檔、乖離過大、正常洗盤）！必須直指真實新聞事件與政經元兇！
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆看。`;

        const candidateModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
        let text = null;
        for (const modelName of candidateModels) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: { temperature: 0.1 }
            });
            const res = await model.generateContent(prompt);
            text = res.response.text().trim();
            if (text) {
              aiVerdict = text;
              break;
            }
          } catch (modelErr) {
            logger.warn('PreMarket', `模型 ${modelName} 失敗: ${modelErr.message}`);
          }
        }
      } catch (geminiError) {
        logger.warn('PreMarket', 'Gemini API 額度不足或暫時無法連線，啟用智慧型規則引擎產出分析: ' + geminiError.message);
      }
    }

    const html = `☀️ <b>【08:40 盤前試撮與開盤預估】— ${today}</b>

${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('PreMarket', `08:40 盤前快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('PreMarket', '執行 08:40 盤前快報失敗: ' + error.message, error);
    return false;
  }
};
