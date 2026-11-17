import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { sendHTML } from '../notify/telegram.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { isTradingDay } from '../../utils/helpers.js';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * ☀️ 08:40 盤前試撮與開盤預估快報
 * 依使用者最新要求：
 * 1. 專屬個人秒懂版，不需要下半段朋友分析，不分上下段
 * 2. 移除任何「老手」自稱或花俏抬頭
 * 3. 3秒看懂：開盤預估、預估漲跌、原因大白話、今日應對一句話
 * 4. 正常交易日週一至週五發送，連假休市絕不推播
 */
export const runPreMarketScan = async (force = false) => {
  if (!force && !isTradingDay()) {
    logger.info('PreMarket', '🛑 今日為台股休市日／連假，不執行 08:40 盤前快報');
    return false;
  }

  logger.info('PreMarket', '🌅 執行 08:40 盤前試撮與開盤預估快報掃描...');

  const rawChatId = process.env.TELEGRAM_CHAT_ID;
  if (!rawChatId) {
    logger.warn('PreMarket', '未設定 TELEGRAM_CHAT_ID，跳過 08:40 推播');
    return false;
  }

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    // 獲取隔夜美股與 ADR 數據
    const [tsmQuote, nvdaQuote, soxQuote, news, tseQuote, tsmcQuote] = await Promise.all([
      yahooFinance.quote('TSM').catch(() => null),
      yahooFinance.quote('NVDA').catch(() => null),
      yahooFinance.quote('^SOX').catch(() => null),
      fetchLatestStockNews(6),
      getQuote('IX0001'),
      getQuote('2330')
    ]);

    const tsmPrice = tsmQuote?.regularMarketPrice || 0;
    const tsmChange = parseFloat(tsmQuote?.regularMarketChangePercent || 0).toFixed(2);
    const tsmSign = parseFloat(tsmChange) >= 0 ? '+' : '';

    const nvdaPrice = nvdaQuote?.regularMarketPrice || 0;
    const nvdaChange = parseFloat(nvdaQuote?.regularMarketChangePercent || 0).toFixed(2);
    const nvdaSign = parseFloat(nvdaChange) >= 0 ? '+' : '';

    const soxPrice = soxQuote?.regularMarketPrice || 0;
    const soxChange = parseFloat(soxQuote?.regularMarketChangePercent || 0).toFixed(2);
    const soxSign = parseFloat(soxChange) >= 0 ? '+' : '';

    const tsePrevClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tsmcPrevClose = tsmcQuote?.closePrice || tsmcQuote?.lastPrice || 0;

    const newsText = (news || []).map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '• 開盤預估：【平盤附近開出】\n• 今天預估漲跌：【高檔震盪】\n• 原因大白話：外盤震盪整理，今日開盤回歸基本面。\n• 今日應對：持股續抱，勿躁進追價。';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.0 // 鎖死零度
        }
      });

      const prompt = `現在是台灣時間早上 08:40，台股進入委託試撮階段（08:45 台指期開盤、09:00 現貨開盤）。
請為老闆產出最簡單、直白、3秒看懂的「08:40 開盤預估」，不需要任何專業術語，不要下半段分析，嚴禁任何自稱廢話。

【昨夜美股與隔夜指標真實收盤】：
- 台積電 ADR (TSM)：收盤 ${tsmPrice} 美元 (${tsmSign}${tsmChange}%)
- 輝達 (NVDA)：收盤 ${nvdaPrice} 美元 (${nvdaSign}${nvdaChange}%)
- 費城半導體指數 (^SOX)：收盤 ${soxPrice} 點 (${soxSign}${soxChange}%)
- 台股昨收基準：加權指數昨收 ${tsePrevClose} 點，台積電昨收 ${tsmcPrevClose} 元

【今晨重要財經頭條】：
${newsText || '暫無突發重大新聞'}

【必須嚴格遵守的輸出格式】（嚴禁多餘廢話、前言、結尾或任何「老手」稱呼，直接輸出以下四行）：
• 開盤預估：【預估開高】（或【預估開低】/【平盤附近開出】）
• 今天預估漲跌：【看漲】（或【看跌】/【高檔震盪】/【多空拉鋸】）
• 原因大白話：用 1~2 句最簡單好懂的話解釋為什麼（例如：昨晚美股費半大跌超過5%，台積電 ADR 也重挫，今天台股開盤會直接承受賣壓開低）。
• 今日應對：一句話直接給老闆明確動作（例如：開低先不要慌著砍股票，看 09:30 前有沒有買盤接 / 勿急躁接刀）。

【絕對嚴格禁止】：
- 嚴禁提及「老手」、「建議觀望」、「投資盈虧自負」、「請謹慎評估」、「守護本金」、「停損停利」、「勝率」。
- 嚴禁分「上半段／下半段」，全篇直接給老闆看。`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();
    }

    const html = `☀️ <b>【08:40 盤前試撮與開盤預估】— ${today}</b>

${aiVerdict}`;

    const ok = await sendHTML(html);
    logger.info('PreMarket', `08:40 盤前快報發送結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  } catch (error) {
    logger.error('PreMarket', '執行 08:40 盤前快報失敗: ' + error.message, error);
    return false;
  }
};
