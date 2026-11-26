import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchTopHeadlines } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';
import { LINE_CHANNEL_ID } from '../../config/index.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function generatePreMarketRuleBased({ soxChange, tsmChange, nqChange, tsmcTrialPct, tsePrevClose, topNewsTitle }) {
  const soxVal = parseFloat(soxChange) || 0;
  const tsmVal = parseFloat(tsmChange) || 0;
  const nqVal = parseFloat(nqChange) || 0;
  const trialVal = tsmcTrialPct !== null && tsmcTrialPct !== undefined ? parseFloat(tsmcTrialPct) : null;

  let openDir = '【平盤附近開出】';
  let trend = '【高檔震盪】';
  let reason = topNewsTitle ? `市場焦點關注「${topNewsTitle}」，早盤期貨與試撮維持平盤整理，開盤回歸本土節奏。` : '美股期貨與台積電試撮平盤整理，外盤缺乏強勁推力，台股開盤回歸本土盤面節奏。';
  let action = '【建議持股續抱，空手不建議追高】— 原因：目前盤前缺乏明確突破訊號，先看開盤後半小時量能變化，空手不急著躁進。';

  // 若 08:40 台積電試撮或美股早盤期貨已經翻紅強彈，優先採信當下即時風向
  if ((trialVal !== null && trialVal >= 1.0) || nqVal >= 0.6) {
    openDir = '【預估開高走強】';
    trend = '【看漲】';
    reason = topNewsTitle
      ? `早盤小那期貨 (${nqChange}%) 與台積電試撮已轉強翻紅，加上「${topNewsTitle}」帶動買氣回籠。`
      : `雖然昨夜美股震盪，但今晨亞洲盤小那期貨強彈 (${nqChange}%) 且台積電試撮轉強，多頭搶先卡位！`;
    action = '【建議偏多操作或續抱】— 原因：早盤期貨與權值試撮同步走強，開盤切忌殺低，持股續抱即可。';
  } else if ((soxVal <= -2.5 || tsmVal <= -3.0) && nqVal < 0.3 && (trialVal === null || trialVal < 0)) {
    openDir = '【預估開低震盪】';
    trend = '【看跌】';
    reason = topNewsTitle 
      ? `受「${topNewsTitle}」重大利空衝擊，昨晚費半 (${soxChange}%) 與台積電 ADR (${tsmChange}%) 重挫，早盤期貨亦偏弱。`
      : `外盤受重大利空打擊，費半 (${soxChange}%) 與台積電 ADR (${tsmChange}%) 重挫，開盤將承受賣壓。`;
    action = '【明確不建議進場追價接刀】— 原因：外盤科技股重挫且早盤期貨未見止跌，先等 09:30 前看有無買盤進場收腳。';
  } else if (soxVal >= 2.0 || tsmVal >= 2.5) {
    openDir = '【預估開高衝鋒】';
    trend = '【看漲】';
    reason = topNewsTitle
      ? `受「${topNewsTitle}」利多激勵，昨晚美股費半大漲 (${soxChange}%)，台積電 ADR 勁揚 (${tsmChange}%)，帶動多頭氣勢。`
      : `昨晚美股費半強彈 (${soxChange}%)，台積電 ADR 勁揚 (${tsmChange}%)，外資開盤勢必順勢拉抬權值股帶動大盤衝高。`;
    action = '【明確建議逢回加碼買進】— 原因：外盤強勢激勵台股早盤多方動能，建議逢低分批加碼。';
  } else if (soxVal < 0 && nqVal < 0) {
    openDir = '【預估開平走低】';
    trend = '【震盪偏弱】';
    reason = topNewsTitle
      ? `市場關注「${topNewsTitle}」，外盤與早盤期貨動能偏弱，台股開盤預計先在昨收 (${tsePrevClose} 點) 附近震盪消化賣壓。`
      : `美股與早盤期貨小幅回檔整理，台股開盤預計先在昨收 (${tsePrevClose} 點) 附近震盪消化賣壓。`;
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
    const [tsmQuote, nvdaQuote, soxQuote, nqQuote, esQuote, news, tseQuote, tsmcQuote] = await Promise.all([
      yahooFinance.quote('TSM').catch(() => null),
      yahooFinance.quote('NVDA').catch(() => null),
      yahooFinance.quote('^SOX').catch(() => null),
      yahooFinance.quote('NQ=F').catch(() => null),
      yahooFinance.quote('ES=F').catch(() => null),
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

    const nqPrice = nqQuote?.regularMarketPrice || 0;
    const nqChange = parseFloat(nqQuote?.regularMarketChangePercent || 0).toFixed(2);
    const nqSign = parseFloat(nqChange) >= 0 ? '+' : '';

    const esPrice = esQuote?.regularMarketPrice || 0;
    const esChange = parseFloat(esQuote?.regularMarketChangePercent || 0).toFixed(2);
    const esSign = parseFloat(esChange) >= 0 ? '+' : '';

    const tsePrevClose = tseQuote?.previousClose || tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tsmcPrevClose = tsmcQuote?.previousClose || tsmcQuote?.closePrice || tsmcQuote?.lastPrice || 0;

    // 擷取 08:40 台積電真實試撮價位與漲跌幅
    const tsmcTrialPrice = tsmcQuote?.lastTrial?.price || 0;
    let tsmcTrialPct = null;
    let tsmcTrialText = '尚未撮合出參考價';
    if (tsmcTrialPrice > 0 && tsmcPrevClose > 0) {
      tsmcTrialPct = (((tsmcTrialPrice - tsmcPrevClose) / tsmcPrevClose) * 100).toFixed(2);
      const tSign = parseFloat(tsmcTrialPct) >= 0 ? '+' : '';
      tsmcTrialText = `試撮 ${tsmcTrialPrice} 元 (${tSign}${tsmcTrialPct}%，昨收 ${tsmcPrevClose} 元)`;
    }

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = generatePreMarketRuleBased({ soxChange, tsmChange, nqChange, tsmcTrialPct, tsePrevClose, topNewsTitle: news?.[0]?.title });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const prompt = `現在是台灣時間早上 08:40，台股進入委託試撮階段（08:45 台指期開盤、09:00 現貨開盤）。
請為老闆產出最簡單、直白、3秒看懂的「08:40 開盤預估」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【⚠️ 今晨 08:40 當下即時風向（最關鍵！優先反映當下最新買賣力道）】：
- 台積電 (2330) 08:40 即時試撮：${tsmcTrialText}
- 美股小那斯達克期貨 (NQ=F) 亞洲早盤：現報 ${nqPrice} 點 (${nqSign}${nqChange}%)
- 美股標普 500 期貨 (ES=F) 亞洲早盤：現報 ${esPrice} 點 (${esSign}${esChange}%)

【昨夜美股現金收盤（僅作背景參考！若昨夜美股收黑，但今晨美股期貨或台積電試撮已經翻紅轉強，務必以今晨即時風向為準，絕不可死板只看昨夜收盤就亂喊大跌！）】：
- 台積電 ADR (TSM)：收盤 ${tsmPrice} 美元 (${tsmSign}${tsmChange}%)
- 輝達 (NVDA)：收盤 ${nvdaPrice} 美元 (${nvdaSign}${nvdaChange}%)
- 費城半導體指數 (^SOX)：收盤 ${soxPrice} 點 (${soxSign}${soxChange}%)
- 台股昨收基準：加權指數昨收 ${tsePrevClose} 點，台積電昨收 ${tsmcPrevClose} 元

【今晨重要財經頭條與政經事件】：
${newsText || '暫無突發重大新聞'}

【必須嚴格遵守的輸出格式】（直接輸出以下四行，嚴禁多餘廢話）：
• 開盤預估：【預估開高】（或【預估開低】/【平盤附近開出】）
• 今天預估漲跌：【看漲】（或【看跌】/【高檔震盪】/【多空拉鋸】）
• 核心驅動原因：【絕對嚴格禁止只講技術面均線破線、技術回檔等空話！】必須結合今晨即時試撮／期貨風向與最新財經事件，用 1~2 句大白話直接講出真實原因（例如：昨晚美股雖回檔但今晨小那期貨與台積電試撮已率先翻紅反彈，或受特定利空／利多事件驅動）！
• 今日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 絕對禁止在「核心驅動原因」中只講技術面名詞（如破均線、月線有撐、技術性回檔、乖離過大、正常洗盤）！必須直指真實消息與當下即時試撮／期貨買氣！
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
