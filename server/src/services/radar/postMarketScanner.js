import { logger } from '../../utils/logger.js';
import { getMarketSnapshot, getQuote } from '../fugle/marketData.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { setSetting } from '../../db/database.js';
import { analyzeEntry } from '../ai/geminiClient.js';
import { getRevenueForSymbol } from '../fundamentals/revenue.js';
import { getBrokerTracking } from '../fundamentals/brokerTracking.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 盤後兩件事：
 * 1. 14:00 — 發送今日收盤 + AI 明日大盤漲跌預測
 * 2. 14:05 — 掃描當日強勢股，直接推播到 Telegram
 */
export const runPostMarketScan = async () => {
  logger.info('PostMarket', '開始執行盤後任務...');
  await sendDailyPerformanceReport();
  await buildTomorrowWatchlist();
};

// ─────────────────────────────────────
// 任務一：14:00 盤後快報 — 明日漲跌預測
// ─────────────────────────────────────
const sendDailyPerformanceReport = async () => {
  logger.info('PostMarket', '產生 14:00 盤後快報 + 明日預測...');
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  try {
    const { fetchLatestStockNews } = await import('../news/cnyesNews.js');
    const { getQuote } = await import('../fugle/marketData.js');

    const [tseQuote, otcQuote, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('IX0043'),
      fetchLatestStockNews(10)
    ]);

    const tseClose = tseQuote?.closePrice || tseQuote?.lastPrice || 0;
    const tseChange = parseFloat(tseQuote?.changePercent || tseQuote?.change || 0);
    const otcChange = parseFloat(otcQuote?.changePercent || otcQuote?.change || 0);
    const newsText = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    let aiVerdict = '明日方向：資料不足，無法判斷';
    let tomorrowEmoji = '❓';

    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `你是一個直接說結論的台股老手，不說廢話。今天台股已收盤。

今日數據：
- 加權指數收盤: ${tseClose} 點，漲跌: ${tseChange > 0 ? '+' : ''}${tseChange}%
- 櫃買指數漲跌: ${otcChange > 0 ? '+' : ''}${otcChange}%

今日重點新聞：
${newsText}

你只需要做一件事：明確預測明天台股大盤是漲還是跌，以及原因。

格式要求（嚴格遵守）：
第一行：「明日預測：【漲】」或「明日預測：【跌】」或「明日預測：【震盪偏多】」或「明日預測：【震盪偏空】」
第二行開始：用 3~4 句白話說清楚理由（每個理由要有具體數據支撐）

絕對禁止出現：觀望、投資盈虧自負、建議謹慎、守護本金`;

      const res = await model.generateContent(prompt);
      aiVerdict = res.response.text().trim();

      if (aiVerdict.includes('【漲】') || aiVerdict.includes('偏多')) tomorrowEmoji = '📈';
      else if (aiVerdict.includes('【跌】') || aiVerdict.includes('偏空')) tomorrowEmoji = '📉';
      else tomorrowEmoji = '↔️';
    }

    const tseSign = tseChange >= 0 ? '+' : '';
    const html = `${tomorrowEmoji} <b>盤後快報 — ${today}</b>\n\n<b>今日收盤：</b> <code>${tseClose} 點 (${tseSign}${tseChange}%)</code>\n\n<b>🔮 AI 明日預測：</b>\n<pre>${aiVerdict}</pre>`;

    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', '✅ 14:00 明日預測已發送');
  } catch (e) {
    logger.error('PostMarket', '發送盤後快報失敗: ' + e.message);
  }
};

// ─────────────────────────────────────
// 任務二：14:05 盤後選股 — 掃描強勢股直接推播
// ─────────────────────────────────────
const buildTomorrowWatchlist = async () => {
  logger.info('PostMarket', '開始 14:05 盤後 AI 選股...');

  try {
    const bot = getBot();
    const chatId = process.env.TELEGRAM_CHAT_ID;

    const [tseSnapshot, otcSnapshot] = await Promise.all([
      getMarketSnapshot('TSE'),
      getMarketSnapshot('OTC')
    ]);
    const allStocks = [...(tseSnapshot || []), ...(otcSnapshot || [])];

    if (allStocks.length === 0) {
      logger.warn('PostMarket', '無法取得市場快照，跳過選股');
      await setSetting('TOMORROW_WATCHLIST', JSON.stringify([]));
      return;
    }

    // 初篩：漲幅 >3%、量 >1000 張、股價 >20 元
    const candidates = allStocks
      .filter(s => {
        const changeP = parseFloat(s.changePercent || 0);
        const volume = parseInt(s.total?.tradeVolume || s.tradeVolume || 0, 10);
        const price = parseFloat(s.closePrice || s.lastPrice || 0);
        return changeP >= 3.0 && volume >= 1000000 && price >= 20;
      })
      .sort((a, b) => parseFloat(b.changePercent || 0) - parseFloat(a.changePercent || 0))
      .slice(0, 10);

    logger.info('PostMarket', `初篩 ${candidates.length} 檔 → 送 AI 評分`);

    const watchlist = [];
    for (const stock of candidates) {
      try {
        const symbol = stock.symbol;
        const name = stock.name || symbol;
        const closePrice = parseFloat(stock.closePrice || stock.lastPrice || 0);
        const changeP = parseFloat(stock.changePercent || 0);
        const volume = parseInt(stock.total?.tradeVolume || stock.tradeVolume || 0, 10);

        const [chips, news, revenue, brokers] = await Promise.all([
          getChipsForSymbol(symbol),
          fetchNewsByTicker(symbol, 3),
          getRevenueForSymbol(symbol),
          getBrokerTracking(symbol)
        ]);

        const quote = { lastPrice: closePrice, changePercent: changeP, volumeRatio: 2.5 };
        const aiResult = await analyzeEntry(
          symbol, name,
          news.length > 0 ? news : [{ title: `${name} 今日強漲 ${changeP}%` }],
          quote, revenue, chips, brokers
        );

        if (!aiResult || aiResult.confidence_stars < 4) {
          logger.info('PostMarket', `${symbol} ${aiResult?.confidence_stars || 0}星，排除`);
          continue;
        }

        // 籌碼簡要說明
        let chipsLine = '法人無資料';
        if (chips) {
          const fNet = Math.round((chips.foreign || 0) / 1000);
          const tNet = Math.round((chips.trust || 0) / 1000);
          if (fNet > 0 && tNet > 0) chipsLine = `外資買 ${fNet} 張 + 投信買 ${tNet} 張`;
          else if (fNet > 0) chipsLine = `外資買超 ${fNet} 張`;
          else if (tNet > 0) chipsLine = `投信買超 ${tNet} 張`;
          else if (fNet < 0) chipsLine = `外資賣超 ${Math.abs(fNet)} 張`;
          else chipsLine = '法人中立';
        }

        watchlist.push({
          symbol, name, closePrice, changeP,
          volume: Math.round(volume / 1000),
          chipsLine,
          catalyst: news.length > 0 ? news[0].title : '技術面強勢突破',
          aiReasoning: aiResult.catalyst || aiResult.action_plan || '',
          stars: aiResult.confidence_stars
        });

        logger.info('PostMarket', `⭐ ${symbol} ${name} ${aiResult.confidence_stars}星 加入清單`);
      } catch (e) {
        logger.warn('PostMarket', `${stock.symbol} 分析失敗: ${e.message}`);
      }
    }

    // 儲存供早報使用
    await setSetting('TOMORROW_WATCHLIST', JSON.stringify(watchlist));
    await setSetting('TOMORROW_WATCHLIST_DATE', new Date().toISOString().split('T')[0]);

    // 直接推播到 TG
    if (bot && chatId && watchlist.length > 0) {
      const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
      let html = `🎯 <b>盤後選股 — ${today}</b>\n<i>今日強勢股，明日參考：</i>\n\n`;

      for (const s of watchlist) {
        const stars = '⭐'.repeat(s.stars);
        html += `<b>${s.symbol} ${s.name}</b>  ${stars}\n`;
        html += `今收 <code>NT$${s.closePrice}</code>  今漲 <code>+${s.changeP}%</code>  量 <code>${s.volume}張</code>\n`;
        html += `籌碼：${s.chipsLine}\n`;
        html += `題材：<i>${s.catalyst}</i>\n`;
        if (s.aiReasoning) html += `AI：${s.aiReasoning}\n`;
        html += `\n`;
      }

      await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
      logger.info('PostMarket', `✅ 14:05 盤後選股推播完成 (${watchlist.length} 檔)`);
    } else if (watchlist.length === 0) {
      logger.info('PostMarket', '今日無符合條件的強勢股，不推播');
    }

  } catch (e) {
    logger.error('PostMarket', '盤後 AI 選股失敗', e);
  }
};