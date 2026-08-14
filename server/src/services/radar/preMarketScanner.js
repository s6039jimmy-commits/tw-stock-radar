import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { ADR_MAPPING, fetchYahooQuote } from './nightScanner.js';
import { getBot } from '../notify/telegram.js';
import { getSetting } from '../../db/database.js';
import { logger } from '../../utils/logger.js';

export const generatePreMarketReport = async () => {
  logger.info('PreMarket', '🌅 開始生成 08:30 晨間早報...');

  try {
    // 1. 讀取昨天盤後選好的自選股清單
    const watchlistRaw = await getSetting('TOMORROW_WATCHLIST');
    const watchlistDate = await getSetting('TOMORROW_WATCHLIST_DATE');
    let watchlist = [];
    if (watchlistRaw) {
      try { watchlist = JSON.parse(watchlistRaw); } catch (_) {}
    }

    // 2. 獲取 ADR 隔夜表現
    const adrResults = [];
    for (const [ticker, info] of Object.entries(ADR_MAPPING)) {
      const quote = await fetchYahooQuote(ticker);
      if (quote) {
        const sign = parseFloat(quote.changePct) > 0 ? '+' : '';
        adrResults.push({ name: info.name, ticker, changePct: quote.changePct, sign });
      }
    }

    // 3. 判斷整體市場方向
    const avgAdr = adrResults.length > 0
      ? adrResults.reduce((s, a) => s + parseFloat(a.changePct), 0) / adrResults.length
      : 0;
    const marketBias = avgAdr >= 1 ? '🚀 偏多，可積極操作' :
                       avgAdr >= 0 ? '😐 中性，謹慎操作' :
                       avgAdr >= -1 ? '⚠️ 偏弱，縮手觀望' :
                       '🔴 偏空，嚴格停損';

    // 4. 抓今日重點財經新聞
    const news = await fetchLatestStockNews(5);
    const newsText = news.map((n, idx) => `${idx + 1}. ${n.title}`).join('\n');

    // 5. 發送 Telegram 晨間早報
    const bot = getBot();
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!bot || !chatId) {
      logger.warn('PreMarket', '未設定 Telegram，跳過發送');
      return;
    }

    // --- 第一則：大盤方向 ---
    const adrText = adrResults.map(a => `${a.name}(${a.ticker})：${a.sign}${a.changePct}%`).join('\n');
    const htmlMarket = `🌅 <b>08:30 晨間早報</b>

<b>📊 指標 ADR 隔夜表現：</b>
<code>${adrText}</code>

<b>今日大盤方向：</b> ${marketBias}

<b>📰 今日重點新聞：</b>
<i>${newsText}</i>`;

    await bot.sendMessage(chatId, htmlMarket, { parse_mode: 'HTML' });

    // --- 第二則：今日進場清單（最重要！）---
    if (watchlist && watchlist.length > 0) {
      let htmlWatchlist = `🎯 <b>今日開盤進場清單</b>\n`;
      htmlWatchlist += `<i>以下為昨日盤後選出的強勢股，請在 09:00 前評估是否掛單！</i>\n\n`;

      for (let i = 0; i < watchlist.length; i++) {
        const s = watchlist[i];
        htmlWatchlist += `<b>${i + 1}. ${s.symbol} ${s.name}</b>\n`;
        htmlWatchlist += `   昨日收盤：<code>NT$ ${s.closePrice}</code>  昨日漲幅：<code>+${s.changeP}%</code>\n`;
        htmlWatchlist += `   籌碼：${s.chipsScore}\n`;
        htmlWatchlist += `   題材：<i>${s.catalyst}</i>\n`;
        htmlWatchlist += `   ——————————\n`;
        htmlWatchlist += `   📌 建議操作\n`;
        htmlWatchlist += `   進場價：<code>NT$ ${s.suggestBuy}</code>（開盤不破此價再買）\n`;
        htmlWatchlist += `   🛡 停損：<code>NT$ ${s.stopLoss}</code>\n`;
        htmlWatchlist += `   🎯 目標：<code>NT$ ${s.target}</code>\n\n`;
      }
      htmlWatchlist += `⚠️ <i>投資盈虧自負，請務必設好停損！</i>`;

      await bot.sendMessage(chatId, htmlWatchlist, { parse_mode: 'HTML' });
      logger.info('PreMarket', `✅ 今日進場清單已發送 (${watchlist.length} 檔)`);
    } else {
      await bot.sendMessage(chatId,
        `🎯 <b>今日開盤進場清單</b>\n\n😴 昨日無符合條件的強勢股，今天建議空手觀望。\n\n<i>等待下午 14:05 盤後系統自動篩選明日清單。</i>`,
        { parse_mode: 'HTML' }
      );
    }

    logger.info('PreMarket', '✅ 晨間早報已發送');
  } catch (error) {
    logger.error('PreMarket', '生成晨間早報失敗', error);
  }
};
