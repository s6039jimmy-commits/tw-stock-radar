import { logger } from '../../utils/logger.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isUsMarketOpen, isUsTradingDay } from '../../utils/helpers.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

let lastNightAlertDate = null;
let triggeredNightLevels = new Set(); // 記錄當晚已發送之警報 (1: 漲跌超過 1%, 2: 漲跌超過 2.5%)

function generateNightRuleBased({ ewtPrice, ewtChangePercent, qqqmPrice, qqqmChangePercent }) {
  const ewtPct = parseFloat(ewtChangePercent) || 0;
  const qqqmPct = parseFloat(qqqmChangePercent) || 0;

  let impact = '';
  let action = '';

  const isUp = (ewtPct >= 1.0 || qqqmPct >= 1.0);
  const isDown = (ewtPct <= -1.0 || qqqmPct <= -1.0);

  if (isDown) {
    impact = `今晚美股夜盤 EWT (${ewtChangePercent}%) 與 QQQM (${qqqmChangePercent}%) 跌幅超過 1%，外盤科技股全面承壓，明日台股早盤預料將直接開低消化賣壓。`;
    action = '【觀望】— 原因：夜盤外盤賣壓沉重，明日台股開盤切勿盲目急躁接刀，先等 09:30 前看有無買盤進場收腳防守。';
    if (ewtPct <= -2.5 || qqqmPct <= -2.5) {
      action = '【賣一點】— 原因：美股科技股夜盤出現重大崩跌，若明日台股開盤持股跌破五日均線，可適度減碼收回部分現金避險。';
    }
  } else if (isUp) {
    impact = `今晚美股夜盤 EWT (${ewtChangePercent}%) 與 QQQM (${qqqmChangePercent}%) 大漲超過 1%，科技股多頭氣勢強勁，明日台股開盤預料順勢開高衝鋒。`;
    action = '【加倉】— 原因：外盤科技股強勢大漲激勵多頭動能，若手中持股拉回均線有撐，可逢低分批加碼。';
  } else {
    impact = `今晚美股夜盤 EWT 與 QQQM 小幅波動，走勢大致平穩。`;
    action = '【觀望】— 原因：外盤波動有限，維持既有持股即可。';
  }

  return `• 明日開盤影響：${impact}\n• 明日應對：${action}`;
}

/**
 * 🌙 半夜夜盤監控：EWT / QQQM 漲跌超過 1% 跳通知
 * 依使用者最新要求：
 * 1. 監控 EWT 與 QQQM，只要有漲或跌超過 1%，立即推播通知
 * 2. 防洗版防擾眠：整晚同一方向同一級距只通知一次，不重複轟炸
 * 3. 3秒看懂、無「老手」稱呼、給出【加倉】/【賣一點】/【觀望】與大白話原因
 */
export const scanNightSession = async (force = false) => {
  if (!force) {
    // 檢查美股是否為交易日及是否在開盤交易時段 (紐約 09:30 - 16:00，對應台北時間 21:30~05:00)
    if (!isUsTradingDay() || !isUsMarketOpen()) {
      return false;
    }
  }

  logger.info('NightScanner', '🌙 執行美股夜盤 EWT 與 QQQM 波動巡檢...');

  const usToday = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  if (lastNightAlertDate !== usToday) {
    lastNightAlertDate = usToday;
    triggeredNightLevels.clear();
  }

  try {
    const [ewtQuote, qqqmQuote] = await Promise.all([
      yahooFinance.quote('EWT').catch(() => null),
      yahooFinance.quote('QQQM').catch(() => null)
    ]);

    if (!ewtQuote || !qqqmQuote) return false;

    const ewtPrice = ewtQuote?.regularMarketPrice || 0;
    const ewtChangePercent = parseFloat(ewtQuote?.regularMarketChangePercent || 0).toFixed(2);
    const ewtSign = parseFloat(ewtChangePercent) >= 0 ? '+' : '';

    const qqqmPrice = qqqmQuote?.regularMarketPrice || 0;
    const qqqmChangePercent = parseFloat(qqqmQuote?.regularMarketChangePercent || 0).toFixed(2);
    const qqqmSign = parseFloat(qqqmChangePercent) >= 0 ? '+' : '';

    const ewtPctNum = parseFloat(ewtChangePercent);
    const qqqmPctNum = parseFloat(qqqmChangePercent);

    // 判斷是否有漲或跌超過 1%
    const isLevel1 = (Math.abs(ewtPctNum) >= 1.0) || (Math.abs(qqqmPctNum) >= 1.0);
    const isLevel2 = (Math.abs(ewtPctNum) >= 2.5) || (Math.abs(qqqmPctNum) >= 2.5);

    if (!isLevel1 && !force) {
      return false; // 平常安靜，不吵醒睡覺
    }

    let alertLevel = 0;
    let title = '';
    const isPlunge = (ewtPctNum <= -1.0 || qqqmPctNum <= -1.0);

    if (isLevel2 && !triggeredNightLevels.has(2)) {
      alertLevel = 2;
      title = isPlunge ? '🔥 <b>【美股夜盤重大崩跌警報】EWT / QQQM 跌幅破 2.5%！</b>' : '🚀 <b>【美股夜盤強勢大漲警報】EWT / QQQM 漲幅破 2.5%！</b>';
    } else if (isLevel1 && !triggeredNightLevels.has(1)) {
      alertLevel = 1;
      title = isPlunge ? '🌙 <b>【美股夜盤重挫警報】EWT / QQQM 跌幅超過 1%！</b>' : '🌙 <b>【美股夜盤大漲通知】EWT / QQQM 漲幅超過 1%！</b>';
    } else if (force) {
      alertLevel = 1;
      title = isPlunge ? '🌙 <b>【美股夜盤警報 - 實測】EWT / QQQM 波動通知</b>' : '🌙 <b>【美股夜盤通知 - 實測】EWT / QQQM 波動通知</b>';
    } else {
      // 當晚已通知過，防擾眠不重複洗版
      return false;
    }

    const todayStr = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    let analysisText = generateNightRuleBased({ ewtPrice, ewtChangePercent, qqqmPrice, qqqmChangePercent });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.0 }
        });

        const prompt = `今晚美股夜盤交易中，EWT (台灣ETF) 與 QQQM (那斯達克科技ETF) 漲跌幅度超過 1%：
- EWT (iShares 台灣 ETF)：${ewtPrice} 美元 (${ewtSign}${ewtChangePercent}%)
- QQQM (那斯達克100 ETF)：${qqqmPrice} 美元 (${qqqmSign}${qqqmChangePercent}%)

請為老闆產出最簡單、直白、3秒看懂的夜盤波動警報（不要任何專業術語，嚴禁任何自稱廢話）：
• 明日開盤影響：用 1~2 句大白話說明外盤漲跌對明天早盤台股開盤的具體衝擊。
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
• <b>QQQM 科技 ETF：</b><code>${qqqmPrice} USD (${qqqmSign}${qqqmChangePercent}%)</code>
${analysisText}`;

    const ok = await sendHTML(html);
    if (ok && alertLevel > 0) {
      triggeredNightLevels.add(alertLevel);
      logger.info('NightScanner', `夜盤 EWT / QQQM 波動警報 (Level ${alertLevel}) 發送成功`);
    }
    return ok;
  } catch (error) {
    logger.error('NightScanner', '夜盤檢查失敗: ' + error.message, error);
    return false;
  }
};
