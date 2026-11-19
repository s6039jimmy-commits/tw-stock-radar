import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';
import { LINE_CHANNEL_ID } from '../../config/index.js';

function generateOpenMarketRuleBased({ tsePrice, tseChange, tseChangePercent, tsmcPrice, tsmcChange }) {
  const cPct = parseFloat(tseChangePercent) || 0;

  let style = '【平穩開出，多空試探】';
  let whale = '開盤買賣力道相對均衡，台積電與主流族群維持平穩，市場等待盤中主流浮現。';
  let action = '【建議持股續抱，暫先觀望】— 原因：開盤多空方向尚在試探，先觀察前 30 分鐘成交量能與主流領頭族群再行定奪。';

  if (cPct >= 1.0) {
    style = '【多方跳空強攻】';
    whale = '外資與大戶開盤積極敲進權值股與高股息 ETF，買氣旺盛，多方氣勢如虹。';
    action = '【建議持股續抱，強勢族群可逢拉回偏多布局】— 原因：開盤跳空帶量開高，多頭主控，空手者等待早盤壓回均線有守再切入，切忌盲目急追第一根。';
  } else if (cPct <= -2.0) {
    style = '【空方全面跳空下殺】';
    whale = '盤面受外盤利空衝擊出現恐慌性拋售，大戶積極避險倒貨，融資賣壓湧現。';
    action = '【明確不建議進場摸底，持股嚴設防守】— 原因：開盤空方破線殺盤，切勿在開盤前 15 分鐘急著接刀，持股先看均線防守。';
  } else if (cPct <= -1.0) {
    style = '【空方壓盤低開】';
    whale = '盤面受外盤拖累賣壓偏重，大戶避險減碼，中小個股跟跌回檔。';
    action = '【不建議進場急躁接刀】— 原因：早盤空方賣壓尚未完全消化，切勿盲目猜底接刀，等待 09:30 後量能沉澱。';
  } else if (cPct < 0) {
    style = '【小幅開低震盪整理】';
    whale = '大戶在台積電低檔有防守買單，追價意願謹慎，屬於良性回檔消化浮額。';
    action = '【已有持股建議續抱，暫不建議盲目加碼】— 原因：盤勢處於消化賣壓階段，手上有持股續抱，空手者等待回測有守再布局。';
  } else if (cPct > 0) {
    style = '【偏多開出小幅走揚】';
    whale = '台積電與指標權值股穩步開出，多方略佔上風，買盤有節奏推進。';
    action = '【建議持股續抱，觀察成交量能】— 原因：開盤偏多表現穩健，先觀察早盤量能是否持續放大，空手者逢回支撐可分批留意。';
  }

  return `• 開盤態勢：${style}\n• 早盤動向：${whale}\n• 開盤應對：${action}`;
}

export const runOpenMarketScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('OpenMarket', '🛑 今日為台股休市日／連假，不執行 09:00 開盤快報');
    return false;
  }

  logger.info('OpenMarket', '🔔 執行 09:00 台股開盤戰況速報掃描...');

  const hasTarget = LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ID || process.env.LINE_CHANNEL_ACCESS_TOKEN || (process.env.ENABLE_TELEGRAM === 'true' && process.env.TELEGRAM_CHAT_ID);
  if (!hasTarget) {
    logger.warn('OpenMarket', '未設定推播目標 (LINE 或 TG)，跳過 09:00 開盤快報');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tseQuote, tsmcQuote, honhaiQuote, q56, q6208, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('2330'),
      getQuote('2317'),
      getQuote('0056'),
      getQuote('006208'),
      fetchLatestStockNews(8)
    ]);

    const price56 = q56?.closePrice || q56?.lastPrice || 0;
    const change56 = parseFloat(q56?.changePercent || q56?.change || 0);
    const sign56 = change56 >= 0 ? '+' : '';

    const price6208 = q6208?.closePrice || q6208?.lastPrice || 0;
    const change6208 = parseFloat(q6208?.changePercent || q6208?.change || 0);
    const sign6208 = change6208 >= 0 ? '+' : '';

    const tsePrice = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.change || 0);
    const tseChangePercent = parseFloat(tseQuote?.changePercent || 0);
    const tseSign = tseChange >= 0 ? '+' : '';

    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = generateOpenMarketRuleBased({ tsePrice, tseChange, tseChangePercent, tsmcPrice, tsmcChange });

    if (process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: 'gemini-3.1-flash-lite',
          generationConfig: { temperature: 0.0 }
        });

        const prompt = `現在是台灣時間早上 09:00 台股開盤（撮合定價完成）。
請為老闆產出最簡單、直白、3秒看懂的「09:00 開盤戰況速報」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【開盤第一手真實數據】：
- 加權指數大盤：${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)
- 0056 元大高股息：${price56} 元 (${sign56}${change56}%)
- 006208 富邦台灣50：${price6208} 元 (${sign6208}${change6208}%)
- 台積電 (2330)：${tsmcPrice} 元 (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：${honhaiPrice} 元 (${honhaiSign}${honhaiChange}%)

【今晨重要財經頭條】：
${newsText || '暫無突發異常利多利空'}

【必須嚴格遵守的輸出格式】（直接輸出以下三行，嚴禁多餘廢話）：
• 開盤態勢：【跳空強攻】（或【開平震盪】/【跳空開低】/【多空拉鋸】）
• 早盤動向：用一句大白話說明大戶或權值股在早盤的第一動作（例如：台積電開高帶動大盤，買氣集中在電子主流 / 開低消化賣壓，買盤在平盤下方低接）。
• 開盤應對：明確建議【加倉】、【賣一點】或【觀望】（三擇一），並緊接一句大白話說明具體原因。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆秒懂。`;

        const res = await model.generateContent(prompt);
        const text = res.response.text().trim();
        if (text) aiVerdict = text;
      } catch (geminiError) {
        logger.warn('OpenMarket', 'Gemini API 額度不足或暫時無法連線，啟用智慧型規則引擎產出分析: ' + geminiError.message);
      }
    }

    const html = `🔔 <b>【09:00 台股開盤戰況速報】— ${today}</b>

• <b>加權指數：</b><code>${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)</code>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>台積電現況：</b><code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code>
${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('OpenMarket', `09:00 開盤快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('OpenMarket', '執行 09:00 開盤快報失敗: ' + error.message, error);
    return false;
  }
};
