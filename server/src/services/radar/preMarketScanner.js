import { fetchLatestStockNews } from '../news/cnyesNews.js';
import { ADR_MAPPING, fetchYahooQuote } from './nightScanner.js';
import { getBot } from '../notify/telegram.js';
import { getSetting } from '../../db/database.js';
import { logger } from '../../utils/logger.js';
import { isTradingDay } from '../../utils/helpers.js';

export const generatePreMarketReport = async () => {
  // 檢查是否為台股正常交易日（連假、國定假日、休市不推播）
  if (!isTradingDay()) {
    logger.info('PreMarket', '🛑 今日為台股休市日／連假，不執行 08:30 晨間早報');
    return;
  }

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
    const marketBias = avgAdr >= 1 ? '🚀 強勢多頭 (預估開高，有利多單發動)' :
                       avgAdr >= 0 ? '😐 震盪整理 (預估平盤，回歸個股表現)' :
                       avgAdr >= -1 ? '⚠️ 弱勢震盪 (預估開低，建議保守應對)' :
                       '🔴 空頭殺盤 (預估重挫，請保護現金與停損)';

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

    // 依使用者指示：全面取消個股進場清單推播，只保留大盤方向
    // 不再推播任何個股名單

    logger.info('PreMarket', '✅ 晨間早報（純大盤方向）已發送');

    logger.info('PreMarket', '✅ 晨間早報已發送');
  } catch (error) {
    logger.error('PreMarket', '生成晨間早報失敗', error);
  }
};
