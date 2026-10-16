import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 🎯 14:05 盤後大盤指數推播
 * 依使用者嚴格要求：
 * 1. 絕不推播任何個股！只看整體大方向、加權指數與櫃買指數
 * 2. 明確給出明日是【漲】還是【跌】的唯一結論
 * 3. 嚴禁任何停損停利、風控、守護本金、勝率統計等廢話
 */
export const runPostMarketScan = async () => {
  logger.info('PostMarket', '📊 執行 14:05 大盤指數明日漲跌預測推播...');

  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) {
    logger.warn('PostMarket', '未設定 Telegram，跳過 14:05 推播');
    return;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tseQuote, otcQuote, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('IX0043'),
      fetchLatestStockNews(12)
    ]);

    const tseClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.changePercent || tseQuote?.change || 0);
    const otcClose = otcQuote?.closePrice || otcQuote?.lastPrice || 0;
    const otcChange = parseFloat(otcQuote?.changePercent || otcQuote?.change || 0);
    const newsText = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '明日大盤預測：資料不足，無法精準研判';
    let directionEmoji = '🔮';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度，不准瞎掰
        }
      });

      const prompt = `你是一位講話極度直白、一針見血的台股老盤房交易主管。
現在台股今日盤後數據已出爐：

【今日收盤數據】：
- 加權指數 (大盤)：收盤 ${tseClose} 點，今日漲跌 ${tseChange > 0 ? '+' : ''}${tseChange}%
- 櫃買指數 (OTC)：收盤 ${otcClose} 點，今日漲跌 ${otcChange > 0 ? '+' : ''}${otcChange}%

【今日重點財經新聞與資金動向】：
${newsText}

【任務要求】：
嚴禁推薦任何單一個股！你只需要對「明日台股大盤指數」做出一刀兩斷的精確預測。

【必須遵守的格式】（嚴禁更動）：
第一行：明日大盤方向：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）
第二行開始列出 3 點具體判斷依據（用最白話、最硬派的文字，講清楚權值動態、市場情緒與實質資金邏輯）：
1. 權值股與外資動向：...
2. 市場熱度與題材共識：...
3. 明日走勢關鍵劇本：...

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁推薦任何單一個股代號與名稱。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();

      if (aiVerdict.includes('【漲】') || aiVerdict.includes('偏多')) {
        directionEmoji = '📈';
      } else if (aiVerdict.includes('【跌】') || aiVerdict.includes('偏空')) {
        directionEmoji = '📉';
      } else {
        directionEmoji = '⚖️';
      }
    }

    const tseSign = tseChange >= 0 ? '+' : '';
    const otcSign = otcChange >= 0 ? '+' : '';

    const html = `${directionEmoji} <b>【14:05 大盤指數明日預測】— ${today}</b>

<b>📌 今日指數收盤：</b>
• 加權指數：<code>${tseClose} 點 (${tseSign}${tseChange}%)</code>
• 櫃買指數：<code>${otcClose} 點 (${otcSign}${otcChange}%)</code>

<b>🎯 明日指數預測與核心邏輯：</b>
<pre>${aiVerdict}</pre>`;

    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', '✅ 14:05 大盤指數預測已成功推播至 Telegram');
  } catch (e) {
    logger.error('PostMarket', '14:05 大盤推播失敗: ' + e.message);
  }
};