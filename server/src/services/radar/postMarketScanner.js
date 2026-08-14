import { logger } from '../../utils/logger.js';
import { getMarketSnapshot, getQuote } from '../fugle/marketData.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';
import { setSetting, getActivePositions, getTradeStats } from '../../db/database.js';
import { analyzeEntry } from '../ai/geminiClient.js';
import { getRevenueForSymbol } from '../fundamentals/revenue.js';
import { getBrokerTracking } from '../fundamentals/brokerTracking.js';

/**
 * 盤後執行兩件事：
 * 1. 發送「今日持倉績效會報」
 * 2. 全市場掃描今日強勢股 → 過 AI 5 星關 → 存為「明日進場清單」
 */
export const runPostMarketScan = async () => {
  logger.info('PostMarket', '📊 開始執行盤後任務...');

  // === 任務一：今日持倉績效會報 ===
  await sendDailyPerformanceReport();

  // === 任務二：AI 5 星選股 → 存為明日清單 ===
  await buildTomorrowWatchlist();
};

// ─────────────────────────────────────
// 任務一：今日績效會報
// ─────────────────────────────────────
const sendDailyPerformanceReport = async () => {
  logger.info('PostMarket', '📋 產生今日盤後總結...');
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  // ── 1. 抓今日大盤資料 + 熱門新聞 ──
  let marketSummary = '';
  try {
    const { fetchLatestStockNews } = await import('../news/cnyesNews.js');
    const { getQuote } = await import('../fugle/marketData.js');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const [tseQuote, otcQuote, news] = await Promise.all([
      getQuote('IX0001'),
      getQuote('IX0043'),
      fetchLatestStockNews(8)
    ]);

    const tseChange = tseQuote?.changePercent || tseQuote?.change || 0;
    const otcChange = otcQuote?.changePercent || otcQuote?.change || 0;
    const newsText = news.map((n, i) => `${i + 1}. ${n.title}`).join('\n');

    // 用 AI 生成今日市場總結
    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `你是台股資深分析師，今天台股已收盤。
加權指數漲跌：${tseChange > 0 ? '+' : ''}${tseChange}%，櫃買指數：${otcChange > 0 ? '+' : ''}${otcChange}%

今日重點新聞：
${newsText}

請用 150 字以內的白話文，寫出：
1. 今天大盤的整體方向與原因（例如：哪類股強、哪類股弱、外資動向）
2. 明天開盤要注意什麼風險或機會
語氣精準有力，直接給結論。`;

      const res = await model.generateContent(prompt);
      marketSummary = res.response.text();
    }
  } catch (e) {
    logger.warn('PostMarket', `市場總結生成失敗: ${e.message}`);
    marketSummary = '今日市場資料取得失敗，請自行查閱財經媒體。';
  }

  // ── 2. 建立報告 ──
  let html = `📊 <b>今日盤後總結 — ${today}</b>\n\n`;

  // 市場方向 AI 總結
  html += `<b>🤖 今日市場總結：</b>\n`;
  html += `<pre>${marketSummary}</pre>\n\n`;

  // 持倉績效
  const positions = getActivePositions();
  const stats = getTradeStats();

  if (positions.length === 0) {
    html += `<b>📌 持倉：</b> 目前無持倉，空手觀望中。\n`;
  } else {
    html += `<b>📌 監控中持倉（${positions.length} 檔）：</b>\n`;
    for (const pos of positions) {
      try {
        const { getQuote } = await import('../fugle/marketData.js');
        const quote = await getQuote(pos.symbol);
        const currentPrice = quote?.lastPrice || quote?.closePrice || pos.entry_price;
        const pnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100;
        const pnlSign = pnlPct >= 0 ? '+' : '';
        const emoji = pnlPct >= 5 ? '🚀' : pnlPct >= 0 ? '🟢' : pnlPct >= -4 ? '🟡' : '🔴';
        html += `${emoji} <b>${pos.symbol} ${pos.name}</b>  進場 <code>NT$${pos.entry_price}</code> → 今收 <code>NT$${currentPrice}</code>  <code>${pnlSign}${pnlPct.toFixed(2)}%</code>`;
        if (pnlPct <= -5) html += ` ⚠️ 接近停損`;
        if (pnlPct >= 12) html += ` 🎯 接近目標`;
        html += `\n`;
      } catch (e) {
        html += `⚪ <b>${pos.symbol} ${pos.name}</b> — 報價取得失敗\n`;
      }
    }
  }

  html += `\n<b>📈 系統累積：</b> 總交易 <code>${stats.totalTrades}</code> 筆　勝率 <code>${stats.winRate}%</code>　平均損益 <code>${stats.avgProfitPct > 0 ? '+' : ''}${stats.avgProfitPct}%</code>`;

  try {
    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', '✅ 今日盤後總結已發送');
  } catch (e) {
    logger.error('PostMarket', '發送盤後總結失敗: ' + e.message);
  }
};

// ─────────────────────────────────────
// 任務二：AI 5 星選股，建立明日清單
// ─────────────────────────────────────
const buildTomorrowWatchlist = async () => {
  logger.info('PostMarket', '🔍 開始 AI 5 星盤後選股...');

  try {
    const [tseSnapshot, otcSnapshot] = await Promise.all([
      getMarketSnapshot('TSE'),
      getMarketSnapshot('OTC')
    ]);
    const allStocks = [...(tseSnapshot || []), ...(otcSnapshot || [])];

    if (allStocks.length === 0) {
      logger.warn('PostMarket', '無法取得市場快照，跳過選股');
      setSetting('TOMORROW_WATCHLIST', JSON.stringify([]));
      return;
    }

    // 第一關：量化初篩（漲幅 >3%、量 >3000 張、股價 >20 元）
    const candidates = allStocks
      .filter(s => {
        const changeP = parseFloat(s.changePercent || 0);
        const volume = parseInt(s.total?.tradeVolume || s.tradeVolume || 0, 10);
        const price = parseFloat(s.closePrice || s.lastPrice || 0);
        return changeP >= 3.0 && volume >= 3000000 && price >= 20;
      })
      .sort((a, b) => parseFloat(b.changePercent || 0) - parseFloat(a.changePercent || 0))
      .slice(0, 10);

    logger.info('PostMarket', `量化初篩：${candidates.length} 檔候選 → 送入 AI 第二關`);

    // 第二關：AI 評分，只有 5 星才進清單
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
        const aiResult = await analyzeEntry(symbol, name, news.length > 0 ? news : [{ title: `${name} 今日爆量強漲 ${changeP}%` }], quote, revenue, chips, brokers);

        if (!aiResult || aiResult.confidence_stars < 5) {
          logger.info('PostMarket', `${symbol} AI 評分：${aiResult?.confidence_stars || 0} 星，未達 5 星，排除`);
          continue;
        }

        logger.info('PostMarket', `⭐⭐⭐⭐⭐ ${symbol} ${name} 通過 AI 5 星關！`);

        // 籌碼評分
        let chipsScore = '無資料';
        if (chips) {
          if (chips.foreign > 0 && chips.trust > 0) chipsScore = '🟢 外資+投信同步買超';
          else if (chips.foreign > 0) chipsScore = '🔵 外資買超';
          else if (chips.trust > 0) chipsScore = '🟡 投信買超';
          else chipsScore = '⚪ 自營商或散戶推升';
        }

        watchlist.push({
          symbol,
          name,
          closePrice,
          changeP,
          volume: Math.round(volume / 1000),
          suggestBuy: (closePrice * 1.005).toFixed(1),
          stopLoss: (closePrice * 0.93).toFixed(1),
          target: (closePrice * 1.15).toFixed(1),
          chipsScore,
          aiReasoning: aiResult.catalyst || '',
          catalyst: news.length > 0 ? news[0].title : '技術面強勢突破'
        });
      } catch (e) {
        logger.warn('PostMarket', `AI 分析 ${stock.symbol} 失敗: ${e.message}`);
      }
    }

    // 儲存到資料庫，供 08:30 早報讀取
    setSetting('TOMORROW_WATCHLIST', JSON.stringify(watchlist));
    setSetting('TOMORROW_WATCHLIST_DATE', new Date().toISOString().split('T')[0]);
    logger.info('PostMarket', `✅ 明日 5 星自選股：${watchlist.length} 檔`);

    // 發送盤後通知
    await sendWatchlistReport(watchlist);

  } catch (e) {
    logger.error('PostMarket', '盤後 AI 選股失敗', e);
  }
};

const sendWatchlistReport = async (watchlist) => {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  if (watchlist.length === 0) {
    await bot.sendMessage(chatId,
      `⭐ <b>明日 AI 5 星進場清單 — ${today}</b>\n\n😴 今日全市場無股票通過 AI 5 星嚴格審核。\n\n空手等機會，別勉強進場。`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }

  let html = `⭐ <b>明日 AI 5 星進場清單 — ${today}</b>\n`;
  html += `<i>以下股票已通過「量化初篩 + AI 5 星審核」，明天 09:00 前可考慮掛單</i>\n\n`;

  for (let i = 0; i < watchlist.length; i++) {
    const s = watchlist[i];
    html += `<b>${i + 1}. ${s.symbol} ${s.name}</b> ⭐⭐⭐⭐⭐\n`;
    html += `   今日收盤：<code>NT$ ${s.closePrice}</code>  漲幅：<code>+${s.changeP}%</code>  量：<code>${s.volume}張</code>\n`;
    html += `   籌碼：${s.chipsScore}\n`;
    html += `   AI 理由：<i>${s.aiReasoning}</i>\n`;
    html += `   ——————————\n`;
    html += `   進場價：<code>NT$ ${s.suggestBuy}</code>（開盤站穩才追）\n`;
    html += `   🛡 停損：<code>NT$ ${s.stopLoss}</code> (-7%)\n`;
    html += `   🎯 目標：<code>NT$ ${s.target}</code> (+15%)\n\n`;
  }

  html += `⚠️ <i>投資盈虧自負，進場請設好停損！</i>`;

  try {
    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', `✅ 明日 5 星清單已發送 (${watchlist.length} 檔)`);
  } catch (e) {
    logger.error('PostMarket', '發送清單失敗: ' + e.message);
  }
};
