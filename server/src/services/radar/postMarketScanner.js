import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';

/**
 * 🎯 14:05 盤後推播：0056 (元大高股息) 與 006208 (富邦台50)
 * 依使用者嚴格要求：
 * 1. 拿掉大盤法人總金額 (+120億等廢話)
 * 2. 聚焦 0056 與 006208 這兩檔核心標的
 * 3. 明確給出明日是【漲】還是【跌】
 * 4. 講清楚【為何這樣判斷】（白話實話）
 * 5. 嚴禁任何停損停利、風控、守護本金、勝率統計等廢話
 * 6. 連假或國定假日休市絕不推播
 */
export const runPostMarketScan = async () => {
  // 檢查是否為台股正常交易日（國定假日、連假、颱風假休市絕不推播）
  if (!isTradingDay()) {
    logger.info('PostMarket', '🛑 今日為台股休市日／連假，不執行 14:05 推播');
    return;
  }

  logger.info('PostMarket', '📊 執行 14:05 0056 與 006208 明日漲跌預測推播...');

  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) {
    logger.warn('PostMarket', '未設定 Telegram，跳過 14:05 推播');
    return;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [q56, q6208, tseQuote, news] = await Promise.all([
      getQuote('0056'),
      getQuote('006208'),
      getQuote('IX0001'),
      fetchLatestStockNews(12)
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

    const newsText = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '明日預測：資料不足，無法精準研判';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度，不准瞎掰
        }
      });

      const prompt = `你是一位講話極度直白、實戰經驗豐富的台股老手。
現在今日台股盤後數據已正式結算：

【今日收盤數據】：
- 0056 (元大高股息)：收盤價 ${price56} 元 (${sign56}${change56}%)
- 006208 (富邦台50)：收盤價 ${price6208} 元 (${sign6208}${change6208}%)
- 加權指數大盤：收盤 ${tseClose} 點 (${tseSign}${tseChange}%)

【今日重大財經要聞】：
${newsText}

【任務要求】：
針對「0056」與「006208」這兩檔標的，分別給出明天是【漲】還是【跌】的明確判斷，以及為什麼會這樣判斷。

【必須遵守的格式】（嚴禁多餘廢話，直接給出）：
【0056 元大高股息】
• 明日預測：【漲】或【跌】（或【偏多】/【偏空】）
• 為何這樣判斷：用 1~2 句白話說清楚原因（依據高股息成分股表現與資金避險動向）

【006208 富邦台50】
• 明日預測：【漲】或【跌】（或【偏多】/【偏空】）
• 為何這樣判斷：用 1~2 句白話說清楚原因（依據台積電等前50大權值股動能與大盤格局）

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🎯 <b>【14:05 焦點預測：0056 & 006208】— ${today}</b>

<b>📌 今日收盤行情：</b>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>加權指數大盤：</b><code>${tseClose} 點 (${tseSign}${tseChange}%)</code>

<b>🔮 明日漲跌判斷與原因：</b>
<pre>${aiVerdict}</pre>`;

    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', '✅ 14:05 0056 & 006208 明日漲跌推播已成功發送至 Telegram');
  } catch (e) {
    logger.error('PostMarket', '14:05 推播失敗: ' + e.message);
  }
};