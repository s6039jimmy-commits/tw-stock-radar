import { logger } from '../../utils/logger.js';
import { getMarketSnapshot } from '../fugle/marketData.js';
import { getChipsForSymbol } from '../fundamentals/chips.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { getBot } from '../notify/telegram.js';

/**
 * 盤後選股掃描器
 * 每天收盤後 (14:00) 執行，找出「今天表現強勢、明天有機會續漲」的股票
 * 直接推送「明日自選股清單」給使用者，讓他們在今晚決定是否掛開盤買單
 */
export const runPostMarketScan = async () => {
  logger.info('PostMarket', '📊 開始執行盤後選股分析...');

  try {
    // 1. 從富果 API 抓取今日全市場收盤快照
    const [tseSnapshot, otcSnapshot] = await Promise.all([
      getMarketSnapshot('TSE'),
      getMarketSnapshot('OTC')
    ]);

    const allStocks = [...(tseSnapshot || []), ...(otcSnapshot || [])];

    if (allStocks.length === 0) {
      logger.warn('PostMarket', '無法取得市場快照，跳過盤後掃描');
      return;
    }

    // 2. 量化篩選：今日強勢股條件
    // - 收盤漲幅 > 3%（有力道）
    // - 成交量 > 3000 張（有量）
    // - 股價 > 20 元（排除水餃股）
    const candidates = allStocks
      .filter(s => {
        const changeP = parseFloat(s.changePercent || 0);
        const volume = parseInt(s.total?.tradeVolume || s.tradeVolume || 0, 10);
        const price = parseFloat(s.closePrice || s.lastPrice || 0);
        return changeP >= 3.0 && volume >= 3000000 && price >= 20;
      })
      .sort((a, b) => parseFloat(b.changePercent || 0) - parseFloat(a.changePercent || 0))
      .slice(0, 8); // 取最強的 8 檔

    logger.info('PostMarket', `篩選出 ${candidates.length} 檔盤後強勢候選股`);

    if (candidates.length === 0) {
      // 今日大盤疲弱，沒有符合條件的強勢股，也發通知告知
      await sendNoSignalReport();
      return;
    }

    // 3. 對每檔候選股做深度分析
    const watchlist = [];
    for (const stock of candidates) {
      try {
        const symbol = stock.symbol;
        const name = stock.name || symbol;
        const closePrice = parseFloat(stock.closePrice || stock.lastPrice || 0);
        const changeP = parseFloat(stock.changePercent || 0);
        const volume = parseInt(stock.total?.tradeVolume || stock.tradeVolume || 0, 10);

        const [chips, news] = await Promise.all([
          getChipsForSymbol(symbol),
          fetchNewsByTicker(symbol, 2)
        ]);

        // 計算建議的明日進場區間（開盤 ± 1%）
        const suggestBuy = (closePrice * 1.005).toFixed(1);   // 開盤後小漲確認買
        const stopLoss = (closePrice * 0.93).toFixed(1);       // 停損 -7%
        const target = (closePrice * 1.15).toFixed(1);          // 目標 +15%

        // 籌碼評分
        let chipsScore = '無資料';
        if (chips) {
          const foreignNet = chips.foreign || 0;
          const trustNet = chips.trust || 0;
          if (foreignNet > 0 && trustNet > 0) chipsScore = '🟢 外資+投信同步買超';
          else if (foreignNet > 0) chipsScore = '🔵 外資買超';
          else if (trustNet > 0) chipsScore = '🟡 投信買超';
          else chipsScore = '⚪ 自營商或散戶推升';
        }

        watchlist.push({
          symbol,
          name,
          closePrice,
          changeP,
          volume: Math.round(volume / 1000),
          suggestBuy,
          stopLoss,
          target,
          chipsScore,
          catalyst: news.length > 0 ? news[0].title : '技術面突破，無重大新聞'
        });
      } catch (e) {
        logger.warn('PostMarket', `分析 ${stock.symbol} 失敗: ${e.message}`);
      }
    }

    // 4. 發送 Telegram 盤後自選股清單
    await sendWatchlistReport(watchlist);

  } catch (e) {
    logger.error('PostMarket', '盤後選股整體失敗', e);
  }
};

const sendWatchlistReport = async (watchlist) => {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

  let html = `📋 <b>盤後自選股清單 — ${today}</b>\n`;
  html += `<i>以下是今日強勢股，建議您今晚決定是否掛「明日開盤買單」</i>\n\n`;

  for (let i = 0; i < watchlist.length; i++) {
    const s = watchlist[i];
    html += `<b>${i + 1}. ${s.symbol} ${s.name}</b>\n`;
    html += `   今日收盤：<code>NT$ ${s.closePrice}</code>  漲幅：<code>+${s.changeP}%</code>  成交量：<code>${s.volume}張</code>\n`;
    html += `   籌碼：${s.chipsScore}\n`;
    html += `   題材：<i>${s.catalyst}</i>\n`;
    html += `   ——————————————\n`;
    html += `   📌 明日建議操作\n`;
    html += `   進場區間：<code>NT$ ${s.suggestBuy}</code> 附近（開盤確認不回頭才追）\n`;
    html += `   🛡 停損：<code>NT$ ${s.stopLoss}</code> (-7%)\n`;
    html += `   🎯 目標：<code>NT$ ${s.target}</code> (+15%)\n\n`;
  }

  html += `⚠️ <i>以上為量化模型篩選結果，請務必自行判斷，投資盈虧自負。</i>`;

  try {
    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
    logger.info('PostMarket', `✅ 盤後自選股清單已發送 (${watchlist.length} 檔)`);
  } catch (e) {
    logger.error('PostMarket', '發送盤後清單失敗: ' + e.message);
  }
};

const sendNoSignalReport = async () => {
  const bot = getBot();
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;

  const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
  const html = `📋 <b>盤後自選股清單 — ${today}</b>\n\n😴 今日大盤偏弱，沒有符合「漲幅>3%且量>3000張」條件的強勢股。\n\n明天繼續等機會，別亂追，空手是一種策略。`;

  try {
    await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
  } catch (e) {
    logger.error('PostMarket', '發送無訊號通知失敗: ' + e.message);
  }
};
