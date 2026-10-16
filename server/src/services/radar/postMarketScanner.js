import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

/**
 * 抓取全市場三大法人買賣超總金額（億元）
 */
const fetchInstitutionalTotals = async () => {
  try {
    const res = await fetch('https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.stat !== 'OK' || !data.data) return null;

    let foreign = 0, trust = 0, dealer = 0, total = 0;
    for (const row of data.data) {
      const name = row[0];
      const netStr = row[3]?.replace(/,/g, '') || '0';
      const netVal = Math.round(parseFloat(netStr) / 100000000);
      if (name.includes('外資及陸資(不含')) foreign = netVal;
      else if (name.includes('投信')) trust = netVal;
      else if (name.includes('自營商')) dealer += netVal;
      else if (name.includes('合計')) total = netVal;
    }
    return { foreign, trust, dealer, total };
  } catch (e) {
    logger.warn('PostMarket', '取得三大法人買賣超總金額失敗: ' + e.message);
    return null;
  }
};

/**
 * 🎯 14:05 盤後大盤指數推播
 * 依使用者嚴格要求：
 * 1. 絕不推任何單一個股！只聚焦大方向加權指數
 * 2. 明確給出明日大盤【漲】還是【跌】的唯一預測結論
 * 3. 包含深度【判斷原因】與【籌碼／點位界檢】（法人籌碼檢驗 + 明日多空關鍵界線）
 * 4. 嚴禁任何停損停利、風控、守護本金、勝率統計等廢話
 */
export const runPostMarketScan = async () => {
  logger.info('PostMarket', '📊 執行 14:05 大盤指數明日漲跌預測推播 (含原因與界檢)...');

  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) {
    logger.warn('PostMarket', '未設定 Telegram，跳過 14:05 推播');
    return;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const [tseQuote, otcQuote, news, instTotals] = await Promise.all([
      getQuote('IX0001'),
      getQuote('IX0043'),
      fetchLatestStockNews(12),
      fetchInstitutionalTotals()
    ]);

    const tseClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.changePercent || tseQuote?.change || 0);
    const otcClose = otcQuote?.closePrice || otcQuote?.lastPrice || 0;
    const otcChange = parseFloat(otcQuote?.changePercent || otcQuote?.change || 0);
    const newsText = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let instText = '法人數據結算中';
    if (instTotals) {
      instText = `外資 ${instTotals.foreign >= 0 ? '+' : ''}${instTotals.foreign}億，投信 ${instTotals.trust >= 0 ? '+' : ''}${instTotals.trust}億，自營商 ${instTotals.dealer >= 0 ? '+' : ''}${instTotals.dealer}億 (三大法人合計 ${instTotals.total >= 0 ? '+' : ''}${instTotals.total}億)`;
    }

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

      const prompt = `你是一位講話極度直白、實戰經驗豐富的台股盤房主管。
現在台股今日盤後數據已正式結算：

【今日收盤數據】：
- 加權指數 (大盤)：收盤 ${tseClose} 點，今日漲跌 ${tseChange > 0 ? '+' : ''}${tseChange}%
- 櫃買指數 (OTC)：收盤 ${otcClose} 點，今日漲跌 ${otcChange > 0 ? '+' : ''}${otcChange}%
- 三大法人買賣超總計：${instText}

【今日重點財經新聞與重大消息】：
${newsText}

【任務要求】：
嚴禁推薦任何單一個股！你只需要對「明日台股大盤指數」做出一刀兩斷的精確預測，並給出「詳細原因」與「多空界檢」。

【必須遵守的格式】（嚴格依照此結構輸出，不准少任何一項）：
明日大盤方向：【漲】（或【跌】/【震盪偏多】/【震盪偏空】）

【原因剖析】：
用 2~3 句最白話、最硬派的語言，講清楚明天是漲還是跌的根本原因（依據外資進出、權值動能與國際風向，直接說實話）。

【籌碼與借券檢驗 (界檢)】：
檢驗外資與主力今天是在真殺盤、真買超，還是藉由借券/避險在搞鬼，一句話說穿主力意圖。

【明日多空關鍵界線 (界檢)】：
根據今日收盤 ${tseClose} 點，明確給出明日加權指數的三大防守點位界線：
- 上檔壓力界線：約 [具體點位] 點
- 多空分水嶺界線：約 [具體點位] 點
- 下檔支撐界線：約 [具體點位] 點

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
• 法人籌碼：<code>${instText}</code>

<b>🎯 明日預測、原因與界檢：</b>
<pre>${aiVerdict}</pre>`;

    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', '✅ 14:05 大盤指數預測 (含原因與界檢) 已成功推播至 Telegram');
  } catch (e) {
    logger.error('PostMarket', '14:05 大盤推播失敗: ' + e.message);
  }
};