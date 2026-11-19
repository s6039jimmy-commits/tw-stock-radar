import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay, getMarketHolidayAlerts } from '../../utils/helpers.js';
import { LINE_CHANNEL_ID } from '../../config/index.js';

function generatePostMarketRuleBased({ tseClose, tseChange, tseChangePercent, price56, change56, price6208, change6208 }) {
  const cPct = parseFloat(tseChangePercent) || 0;

  let trend = '【高檔震盪】';
  let etfStatus = `0056 (${change56}%) 與 006208 (${change6208}%) 處於區間震盪整理。`;
  let canChase = '【續抱不動，空手不建議追高】';
  let action = '【建議持股續抱，暫不建議進場追買】— 原因：大盤量縮整理方向未明，手上有部位續抱防守即可，空手者切勿心急追高。';

  if (cPct <= -2.0) {
    trend = '【空方全面殺盤】';
    etfStatus = `0056 抗跌 (${change56}%)，006208 隨權值重挫回檔 (${change6208}%)。`;
    canChase = '【明確不可追，建議減碼】';
    action = '【強烈不建議進場，建議逢反彈減碼出清】— 原因：大盤出現恐慌破線殺盤，若手上持股已跌破短期均線，建議先減碼 1/3 收回現金避險！';
  } else if (cPct <= -1.0) {
    trend = '【空方壓制】';
    etfStatus = `0056 高股息相對抗跌 (${change56}%)，006208 市值型隨大盤回檔整理 (${change6208}%)。`;
    canChase = '【不建議進場接刀】';
    action = '【明確不建議進場，建議保留現金等待築底】— 原因：大盤今日回檔跌破短期均線，空方賣壓尚未完全消化，空手者切勿盲目接刀。';
  } else if (cPct >= 1.0) {
    trend = '【多方攻擊】';
    etfStatus = `006208 權值動能強勁 (${change6208}%)，0056 穩定向上 (${change56}%)，多頭架構完好。`;
    canChase = '【強烈建議逢低分批買進】';
    action = '【明確建議加碼買進】— 原因：加權指數帶量站穩均線之上，多方買盤積極，回測均線不破建議分批加碼核心持股！';
  } else if (cPct > 0) {
    trend = '【震盪偏多】';
    etfStatus = `0056 與 006208 表現穩健，盤面呈現良性輪動。`;
    canChase = '【建議逢低分批布局】';
    action = '【建議逢低分批加碼】— 原因：大盤底部墊高且守穩支撐，建議趁盤中壓回時分批布局優質標的。';
  }

  return `• 明天到底會漲還是跌：${trend}\n• 0056 / 006208 現況：${etfStatus}\n• 能不能追：${canChase}\n• 明日應對：${action}`;
}

export const runPostMarketScan = async () => {
  if (!isTradingDay()) {
    logger.info('PostMarket', '🛑 今日為台股休市日／連假，不執行 14:05 推播');
    return false;
  }

  logger.info('PostMarket', '📊 執行 14:05 大盤明日漲跌預測推播...');

  const hasTarget = LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ACCESS_TOKEN || (process.env.ENABLE_TELEGRAM === 'true' && process.env.TELEGRAM_CHAT_ID);
  if (!hasTarget) {
    logger.warn('PostMarket', '未設定推播目標 (LINE 或 TG)，跳過 14:05 推播');
    return false;
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

    let aiVerdict = generatePostMarketRuleBased({ tseClose, tseChange, tseChangePercent: tseChange, price56, change56, price6208, change6208 });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.1-flash-lite',
          generationConfig: { temperature: 0.0 }
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

【必須嚴格遵守的輸出格式】（直接輸出以下四行，嚴禁多餘廢話）：
• 明天到底會漲還是跌：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）
• 0056 / 006208 現況：用一句大白話總結這兩檔今天表現與強弱
• 能不能追：【不可追，等拉回】（或【可以逢低分批買】/【續抱不動，切勿追高】/【反彈減碼】）
• 明日應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆秒懂。`;

        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (text) aiVerdict = text;
      } catch (geminiError) {
        logger.warn('PostMarket', 'Gemini API 額度不足或暫時無法連線，啟用智慧型規則引擎產出分析: ' + geminiError.message);
      }
    }

    const html = `🎯 <b>【14:05 大盤明日預測】— ${today}</b>

<b>📌 今日收盤概況：</b>
• <b>加權指數：</b><code>${tseClose} 點 (${tseSign}${tseChange}%) | 成交約 ${tseValBillion} 億</code>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>台積電：</b><code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code>
${holidaySection}
${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('PostMarket', `✅ 14:05 大盤明日預測推播發送${ok ? '完成' : '失敗'}`);
    return ok;
  } catch (e) {
    logger.error('PostMarket', '14:05 推播失敗: ' + e.message, e);
    return false;
  }
};