import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { ADR_MAPPING, fetchYahooQuote } from './nightScanner.js';
import { getBot } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';

export const generatePreMarketReport = async () => {
  logger.info('PreMarket', '🌅 開始生成 08:30 晨間早報...');

  try {
    // 1. 獲取 ADR 隔夜表現
    const adrResults = [];
    for (const [ticker, info] of Object.entries(ADR_MAPPING)) {
      const quote = await fetchYahooQuote(ticker);
      if (quote) {
        adrResults.push(`${info.name}(${ticker}): ${quote.changePct > 0 ? '+' : ''}${quote.changePct}%`);
      }
    }

    // 2. 抓取半夜到清晨的重點總經新聞 (鉅亨網台股頭條)
    const news = await fetchLatestStockNews(8);
    const newsText = news.map((n, idx) => `${idx + 1}. ${n.title}`).join('\n');

    // 3. 呼叫 AI 進行大盤開盤預測
    let aiSummary = '目前無法連接 AI 伺服器進行分析。';
    
    if (process.env.GEMINI_API_KEY) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `你是一位資深的台股分析師。現在是早上 08:30，台股即將開盤。
請根據以下「美股 ADR 隔夜表現」與「最新重大財經新聞」，撰寫一段約 150 字的【今日台股多空風向球】總結。
語氣要精準、專業，並明確點出今天開盤應該偏多還是偏空操作，以及需要注意的風險。

【ADR 隔夜表現】
${adrResults.join(' | ')}

【最新重點新聞】
${newsText}`;

      const aiRes = await model.generateContent(prompt);
      aiSummary = aiRes.response.text();
    }

    // 4. 發送 Telegram 晨間早報
    const bot = getBot();
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (bot && chatId) {
      const html = `🌅 <b>08:30 晨間多空風向球 (早報)</b>

<b>📊 指標 ADR 隔夜表現：</b>
<code>${adrResults.join('\n')}</code>

<b>🤖 AI 開盤策略解析：</b>
<pre>${aiSummary}</pre>

<i>盤前準備完畢，等待 09:00 開盤雷達啟動！</i>`;
      
      await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
      logger.info('PreMarket', '✅ 晨間早報已發送');
    }
  } catch (error) {
    logger.error('PreMarket', '生成晨間早報失敗', error);
  }
};
