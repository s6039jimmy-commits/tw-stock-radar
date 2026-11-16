import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';

/**
 * 🍱 選擇 B：【中午定點】11:30 午盤快報（一天只發一次）
 * 特色：
 * 1. 不洗版！只在中午 11:30 吃飯時間發一則「大盤上午戰況」
 * 2. 內容涵蓋：大盤走勢、預估成交量、台積電/鴻海/聯發科強弱、大戶偷拉或偷殺動態
 * 3. 雙層架構：
 *    - 老闆速讀區（簡單盤勢定性與下半場行動）
 *    - 朋友深讀區（權值動態、主力進出手法、下午尾盤觀察重點）
 * 4. 嚴格守衛：非開盤日或休市日絕不推播
 */
export const runMiddayScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('MiddayScan', '🛑 今日為台股休市日／連假，不執行 11:30 午盤快報');
    return false;
  }

  logger.info('MiddayScan', '🍱 執行 11:30 午盤大盤戰況快報掃描...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('MiddayScan', '未設定 TELEGRAM_CHAT_ID，跳過 11:30 午盤快報');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tseQuote, tsmcQuote, honhaiQuote, mtkQuote, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('2330'),
      getQuote('2317'),
      getQuote('2454'),
      fetchLatestStockNews(8)
    ]);

    const tsePrice = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.change || 0);
    const tseChangePercent = parseFloat(tseQuote?.changePercent || 0);
    const tseSign = tseChange >= 0 ? '+' : '';
    const tseOpen = tseQuote?.openPrice || tsePrice;
    const tseHigh = tseQuote?.highPrice || tsePrice;
    const tseLow = tseQuote?.lowPrice || tsePrice;

    // 成交量與預估量計算
    const rawVal = tseQuote?.total?.tradeValue || 0;
    const currentValBillion = Math.round(rawVal / 100000000);
    // 11:30 經過 150 分鐘 (全日 270 分鐘)，通常佔全天 58%~65%
    const estValBillion = currentValBillion > 0 ? Math.round(currentValBillion * 1.65) : 0;

    // 權值股動態
    const tsmcPrice = tsmcQuote?.lastPrice || tsmcQuote?.closePrice || 0;
    const tsmcChange = parseFloat(tsmcQuote?.changePercent || tsmcQuote?.change || 0);
    const tsmcSign = tsmcChange >= 0 ? '+' : '';

    const honhaiPrice = honhaiQuote?.lastPrice || honhaiQuote?.closePrice || 0;
    const honhaiChange = parseFloat(honhaiQuote?.changePercent || honhaiQuote?.change || 0);
    const honhaiSign = honhaiChange >= 0 ? '+' : '';

    const mtkPrice = mtkQuote?.lastPrice || mtkQuote?.closePrice || 0;
    const mtkChange = parseFloat(mtkQuote?.changePercent || mtkQuote?.change || 0);
    const mtkSign = mtkChange >= 0 ? '+' : '';

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '午盤判讀：大盤上午震盪，建議維持既有配置。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度
        }
      });

      const prompt = `你是一位講話極度直白、實戰經驗豐富的台股老手。
現在是今日台股盤中 11:30 吃飯時間，請為投資人產出簡潔有力的「11:30 午盤戰況快報」：

【上午 11:30 盤面真實數據】：
- 加權指數大盤：${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)
- 今日上午高低區間：開盤 ${tseOpen} / 最高 ${tseHigh} / 最低 ${tseLow}
- 上午累積成交金額：約 ${currentValBillion} 億元 (全日預估量約 ${estValBillion} 億元)
- 台積電 (2330)：${tsmcPrice} 元 (${tsmcSign}${tsmcChange}%)
- 鴻海 (2317)：${honhaiPrice} 元 (${honhaiSign}${honhaiChange}%)
- 聯發科 (2454)：${mtkPrice} 元 (${mtkSign}${mtkChange}%)

【上午最新盤中快訊】：
${newsText || '暫無突發異常利多利空'}

【任務要求】：
這則快報要同時讓「想看結論的老闆」與「懂比較多的朋友」在中午吃飯時一眼抓住重點：

【必須遵守的格式】（嚴禁多餘廢話，直接輸出）：
🍱 【上午盤勢定性】（給老闆看）
• 上午盤勢風格：【多方控盤攻擊】/【空方壓制殺盤】/【死魚盤窄幅震盪】/【主力拉積掩護出貨】
• 下半場行動一句話：最白話告訴老闆下午要不要動（例如：安心吃飯不必理會 / 勿追高防尾盤回吐 / 多看少做）。

🔍 【主力動態與尾盤觀察】（給朋友看）
1. 權值力道與量能解讀：用 2~3 句老實話分析台積電/權值股表現，以及今天預估量（${estValBillion}億）是爆量換手、攻擊量、還是量縮無動能。
2. 有無主力「偷拉」或「偷殺」：剖析盤面是真拉抬、拉權值出中小、還是特定族群逢低進場。
3. 下午尾盤（13:00~13:30）防守觀察點：以當前 ${tsePrice} 點為基準，提示下午多空關鍵防守點。

【絕對禁止出現以下詞彙與廢話】：
- 嚴禁提及「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁提及個別小型投機股。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `🍱 <b>【11:30 午盤大盤戰況快報】— ${today}</b>

<b>📊 上午大盤戰況：</b>
• <b>加權指數：</b><code>${tsePrice} 點 (${tseSign}${tseChange} 點 / ${tseSign}${tseChangePercent}%)</code>
• <b>上午區間：</b><code>低 ${tseLow} ~ 高 ${tseHigh}</code>
• <b>預估成交量：</b><code>約 ${estValBillion} 億 (截至 11:30 累積 ${currentValBillion} 億)</code>
• <b>核心權值：</b>
  台積電 <code>${tsmcPrice} (${tsmcSign}${tsmcChange}%)</code> | 鴻海 <code>${honhaiPrice} (${honhaiSign}${honhaiChange}%)</code> | 聯發科 <code>${mtkPrice} (${mtkSign}${mtkChange}%)</code>

<b>🔮 老手午盤透視：</b>
<pre>${aiVerdict}</pre>`;

    const ok = await sendHTML(html);
    logger.info('MiddayScan', `11:30 午盤快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('MiddayScan', '執行 11:30 午盤快報失敗: ' + error.message, error);
    return false;
  }
};
