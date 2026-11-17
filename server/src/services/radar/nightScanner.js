import { logger } from '../../utils/logger.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isUsMarketOpen, isUsTradingDay } from '../../utils/helpers.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

let lastNightAlertDate = null;
let triggeredNightLevels = new Set(); // 記錄當晚已發送之警報級距 (1: 跌破 1%, 2: 跌破 2.5%)

function generateNightRuleBased({ ewtChangePercent, tsmChangePercent, soxChangePercent }) {
  const ewtPct = parseFloat(ewtChangePercent) || 0;
  const tsmPct = parseFloat(tsmChangePercent) || 0;
  const soxPct = parseFloat(soxChangePercent) || 0;

  let impact = `今晚美股夜盤 EWT 跌幅達 ${ewtChangePercent}%，台積電 ADR (${tsmChangePercent}%) 與費半指數同步走弱，明日台股早盤預料將直接承壓開低。`;
  let action = '【觀望】— 原因：夜盤外盤賣壓沉重，明日台股開盤切勿盲目急躁接刀，先等 09:30 前看有無特定買盤進場收腳。';

  if (ewtPct <= -2.5 || tsmPct <= -3.5) {
    action = '【賣一點】— 原因：美股夜盤出現非理性重大崩跌，若明日台股開盤持股跌破五日均線，可適度減碼收回現金避險。';
  }

  return `• 明日開盤影響：${impact}\n• 明日應對：${action}`;
}

/**
 * 🌙 半夜夜盤監控：EWT / 美股 ADR 跌幅 ≥ 1% 緊急通知
 * 依使用者最新要求：
 * 1. 半夜若 EWT 或 美股科技指標跌幅超過 1% 以上，立即推播警報
 * 2. 防洗版防擾眠：整晚同一級距只響一次，不重複轟炸
 * 3. 3秒看懂、無「老手」稱呼、給出【加倉】/【賣一點】/【觀望】與大白話原因
 */
export const scanNightSession = async (force = false) => {
  if (!force) {
    // 檢查美股是否為交易日及是否在開盤交易時段 (紐約 09:30 - 16:00，對應台北時間 21:30~05:00)
    if (!isUsTradingDay() || !isUsMarketOpen()) {
      return false;
    }
  }

  logger.info('NightScanner', '🌙 執行美股夜盤 EWT 波動巡檢...');

  const usToday = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  if (lastNightAlertDate !== usToday) {
    lastNightAlertDate = usToday;
    triggeredNightLevels.clear();
  }

  try {
    const [ewtQuote, tsmQuote, soxQuote] = await Promise.all([
      yahooFinance.quote('EWT').catch(() => null),
      yahooFinance.quote('TSM').catch(() => null),
      yahooFinance.quote('^SOX').catch(() => null)
    ]);

    if (!ewtQuote) return false;

    // 取得當前或盤後最新價格與跌幅
    const ewtPrice = ewtQuote?.regularMarketPrice || 0;
    const ewtChangePercent = parseFloat(ewtQuote?.regularMarketChangePercent || 0).toFixed(2);
    const ewtSign = parseFloat(ewtChangePercent) >= 0 ? '+' : '';

    const tsmPrice = tsmQuote?.regularMarketPrice || 0;
    const tsmChangePercent = parseFloat(tsmQuote?.regularMarketChangePercent || 0).toFixed(2);
    const tsmSign = parseFloat(tsmChangePercent) >= 0 ? '+' : '';

    const soxPrice = soxQuote?.regularMarketPrice || 0;
    const soxChangePercent = parseFloat(soxQuote?.regularMarketChangePercent || 0).toFixed(2);
    const soxSign = parseFloat(soxChangePercent) >= 0 ? '+' : '';

    const ewtPctNum = parseFloat(ewtChangePercent);
    const tsmPctNum = parseFloat(tsmChangePercent);
    const soxPctNum = parseFloat(soxChangePercent);

    // 觸發門檻：EWT 跌幅 >= 1% (即 <= -1.0%)，或台積電 ADR / 費半重挫 >= 1.5%
    const isLevel1 = (ewtPctNum <= -1.0) || (tsmPctNum <= -1.5) || (soxPctNum <= -1.5);
    const isLevel2 = (ewtPctNum <= -2.5) || (tsmPctNum <= -3.0) || (soxPctNum <= -3.0);

    if (!isLevel1 && !force) {
      return false; // 平常安靜，不打擾睡覺
    }

    let alertLevel = 0;
    let title = '';
    if (isLevel2 && !triggeredNightLevels.has(2)) {
      alertLevel = 2;
      title = '🔥 <b>【美股夜盤重大崩跌警報】外盤重挫擴大！</b>';
    } else if (isLevel1 && !triggeredNightLevels.has(1)) {
      alertLevel = 1;
      title = '🌙 <b>【美股夜盤警報】EWT / 外盤重挫通知</b>';
    } else if (force) {
      alertLevel = 1;
      title = '🌙 <b>【美股夜盤警報 - 實測】EWT / 外盤重挫通知</b>';
    } else {
      // 當晚已通知過，防擾眠不重複推播
      return false;
    }

    const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    let analysisText = generateNightRuleBased({ ewtChangePercent, tsmChangePercent, soxChangePercent });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.0 }
        });

        const prompt = `今晚美股夜盤交易中，EWT (台灣ETF) 與台積電 ADR 出現明顯跌幅：
- EWT (iShares 台灣 ETF)：${ewtPrice} 美元 (${ewtSign}${ewtChangePercent}%)
- 台積電 ADR (TSM)：${tsmPrice} 美元 (${tsmSign}${tsmChangePercent}%)
- 費城半導體指數 (^SOX)：${soxPrice} 點 (${soxSign}${soxChangePercent}%)

請為老闆產出最簡單、直白、3秒看懂的夜盤跌幅警報（不要任何專業術語，嚴禁任何自稱廢話）：
• 明日開盤影響：用 1~2 句大白話說明外盤下跌對明天早盤台股開盤的具體衝擊。
• 明日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。`;

        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (text) analysisText = text;
      } catch (geminiError) {
        logger.warn('NightScanner', 'Gemini API 額度不足或暫時無法連線，啟用智慧型規則引擎產出分析: ' + geminiError.message);
      }
    }

    const html = `${title} — ${todayStr}

• <b>EWT 台灣 ETF：</b><code>${ewtPrice} USD (${ewtSign}${ewtChangePercent}%)</code>
• <b>台積電 ADR：</b><code>${tsmPrice} USD (${tsmSign}${tsmChangePercent}%)</code>
• <b>費城半導體 (^SOX)：</b><code>${soxSign}${soxChangePercent}%</code>
${analysisText}`;

    const ok = await sendHTML(html);
    if (ok && alertLevel > 0) {
      triggeredNightLevels.add(alertLevel);
      logger.info('NightScanner', `夜盤重挫警報 (Level ${alertLevel}) 發送成功`);
    }
    return ok;
  } catch (error) {
    logger.error('NightScanner', '夜盤檢查失敗: ' + error.message, error);
    return false;
  }
};
