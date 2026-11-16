import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay, getMarketHolidayAlerts } from '../../utils/helpers.js';

/**
 * 🎯 14:05 盤後推播：大盤明日預測與深度剖析
 * 依使用者嚴格指示改版：
 * 上半段（給你秒懂）：不講廢話，3秒看懂「明天到底會漲還是跌、0056/006208 現況、能不能追」。
 * 下半段（給你朋友看門道）：附上內行人真正關心的「硬派籌碼與關鍵點位」，讓她一眼看出 AI 是憑什麼邏輯判斷的。
 */
export const runPostMarketScan = async () => {
  // 檢查是否為台股正常交易日（國定假日、連假、颱風假休市絕不推播）
  if (!isTradingDay()) {
    logger.info('PostMarket', '🛑 今日為台股休市日／連假，不執行 14:05 推播');
    return;
  }

  logger.info('PostMarket', '📊 執行 14:05 大盤明日漲跌預測與深度剖析推播...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('PostMarket', '未設定 Telegram，跳過 14:05 推播');
    return;
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

    let aiVerdict = '明日研判：資料結算中，請維持既有紀律。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度，不准瞎掰
        }
      });

      const prompt = `你是一位講話極度直白、實戰經驗豐富的台股頂尖老手操盤人。
現在今日台股盤後數據已正式結算：

【今日收盤數據】：
- 加權指數大盤：收盤 ${tseClose} 點 (${tseSign}${tseChange}%)，全日成交量約 ${tseValBillion} 億元
- 0056 (元大高股息)：收盤價 NT$ ${price56} (${sign56}${change56}%)
- 006208 (富邦台50)：收盤價 NT$ ${price6208} (${sign6208}${change6208}%)
- 台積電 (2330)：收盤價 NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：收盤價 NT$ ${honhaiPrice} (${honhaiSign}${honhaiChange}%)

【今日重大財經要聞】：
${newsText}

【任務要求】：
這份推播會發到群組裡，群內有兩位對象，請嚴格按照以下兩段結構輸出：
上半段（給你秒懂）：不講廢話，讓老闆 3 秒看懂「明天到底會漲還是跌、0056/006208 現況、能不能追」。
下半段（給你朋友看門道）：附上內行人真正關心的「硬派籌碼與關鍵點位」，讓她一眼看出 AI 是憑什麼邏輯判斷的。

【必須遵守的格式】（嚴禁多餘廢話，直接輸出）：
📱 【上半段：給你秒懂】
• 明天到底會漲還是跌：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）
• 0056 / 006208 現況：用一句大白話總結這兩檔今天的表現狀態與強弱
• 能不能追：【不可追，等拉回】（或【可以逢低分批買】/【續抱不動，切勿追高】/【反彈減碼】）
• 明日行動一句話：給老闆的最直接叮嚀

🔍 【下半段：給你朋友看門道】
1. AI 是憑什麼邏輯判斷的：
   - 權值股動能：剖析台積電 (${tsmcPrice}) 與權值股是真攻還是掩護出貨
   - 量價結構與籌碼意圖：以今日成交量 (${tseValBillion} 億) 剖析主力大戶真實意圖（換手、洗盤還是實質買進）
2. 明日關鍵防守界線（以今日 ${tseClose} 點為基準估算）：
   • 上檔壓力：約 [點位] 點
   • 多空強弱分水嶺：約 [點位] 點
   • 下檔防守支撐：約 [點位] 點

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分析個別投機小型股。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🎯 <b>【14:05 大盤明日預測與深度剖析】— ${today}</b>

<b>📌 今日核心收盤：</b>
• <b>加權指數：</b><code>${tseClose} 點 (${tseSign}${tseChange}%) | 成交約 ${tseValBillion} 億</code>
• <b>0056 元大高股息：</b><code>NT$ ${price56} (${sign56}${change56}%)</code>
• <b>006208 富邦台50：</b><code>NT$ ${price6208} (${sign6208}${change6208}%)</code>
• <b>核心權值：</b>台積電 <code>NT$ ${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code> | 鴻海 <code>NT$ ${honhaiPrice} (${honhaiSign}${honhaiChange}%)</code>
${holidaySection}
<b>🔮 AI 老手研判：</b>
<pre>${aiVerdict}</pre>`;

    await sendHTML(html);
    logger.info('PostMarket', '✅ 14:05 大盤明日預測與深度剖析推播發送完成');
  } catch (e) {
    logger.error('PostMarket', '14:05 推播失敗: ' + e.message, e);
  }
};