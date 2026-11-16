import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay, getMarketHolidayAlerts } from '../../utils/helpers.js';

/**
 * 🎯 14:05 盤後推播：大盤明日預測與深度剖析
 * 依使用者嚴格要求：
 * 1. 核心標的：0056、006208、加權指數大盤
 * 2. 雙層架構：老闆速讀區（簡單漲跌與行動方針）+ 朋友深讀區（主力結構與支撐壓力關鍵點位）
 * 3. 前一天休市預告：若明日台股或美股節日休市，必定在 14:05 提前通知！
 * 4. 嚴禁任何停損停利、風控、守護本金、勝率統計等廢話
 * 5. 連假或國定假日當天休市絕不推播
 */
export const runPostMarketScan = async () => {
  // 檢查是否為台股正常交易日（國定假日、連假、颱風假休市絕不推播）
  if (!isTradingDay()) {
    logger.info('PostMarket', '🛑 今日為台股休市日／連假，不執行 14:05 推播');
    return;
  }

  logger.info('PostMarket', '📊 執行 14:05 大盤明日漲跌預測與深度剖析推播...');

  const bot = getBot();
  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !rawChatId) {
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

    // 檢查明日台股或美股是否有休市（提前在 14:05 預告）
    const holidayAlerts = getMarketHolidayAlerts();
    let holidaySection = '';
    if (holidayAlerts.length > 0) {
      holidaySection = '\n' + holidayAlerts.join('\n') + '\n';
    }

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
這份推播會發到群組裡：一位要看最白話、最直接的結論（老闆）；一位懂比較多、想看具體依據與關鍵點位（朋友）。

【必須遵守的格式】（嚴禁多餘廢話，直接輸出）：
🟢 【明日大盤方向速讀】（給老闆看）
• 明日加權指數：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）
• 明日方針一句話：用一句最直白大白話告訴老闆明天怎麼應對（例如：安心續抱 / 逢回分批加碼 / 勿追高等拉回）。

🔍 【深度操盤邏輯與關鍵點位】（給朋友看）
1. 權值架構與主力動態：用 2~3 句實話剖析台積電等權值股動能，以及主力真實意圖（是真拉抬還是避險掩護）。
2. 明日關鍵防守界線（以今日 ${tseClose} 點為基準估算）：
   • 上檔壓力：約 [點位] 點
   • 多空強弱線：約 [點位] 點
   • 下檔支撐：約 [點位] 點

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分析個別投機小型股。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🎯 <b>【14:05 大盤明日預測與深度剖析】— ${today}</b>

<b>📌 今日核心收盤：</b>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>加權指數大盤：</b><code>${tseClose} 點 (${tseSign}${tseChange}%)</code>
${holidaySection}
<b>🔮 AI 明日研判：</b>
<pre>${aiVerdict}</pre>`;

    const chatIds = String(rawChatId).split(',').map(s => s.trim()).filter(Boolean);
    for (const cid of chatIds) {
      try {
        await bot.sendMessage(cid, html, { parse_mode: 'HTML' });
      } catch (err) {
        logger.error('PostMarket', `發送推播至 ${cid} 失敗: ${err.message}`);
      }
    }
    logger.info('PostMarket', `✅ 14:05 0056 & 006208 明日漲跌推播已發送至 ${chatIds.length} 個聊天室/群組`);
  } catch (e) {
    logger.error('PostMarket', '14:05 推播失敗: ' + e.message);
  }
};