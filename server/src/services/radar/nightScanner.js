import { logger } from '../../utils/logger.js';
import { getSetting, setSetting, addRadarSignal } from '../../db/database.js';

// 主要權值股的 ADR 代碼對照表 (代表期貨夜盤走勢)
export const ADR_MAPPING = {
  'TSM': { symbol: '2330', name: '台積電', type: 'ADR' },
  'UMC': { symbol: '2303', name: '聯電', type: 'ADR' },
  'ASX': { symbol: '3711', name: '日月光', type: 'ADR' },
  'CHT': { symbol: '2412', name: '中華電', type: 'ADR' }
};

// 抓取 Yahoo Finance 的報價
export const fetchYahooQuote = async (ticker) => {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json.chart.result[0].meta;
    
    // 如果盤後有交易 (postMarketPrice)，以盤後為主，否則用常規收盤價
    const currentPrice = meta.postMarketPrice || meta.regularMarketPrice;
    const previousClose = meta.previousClose;
    
    if (!currentPrice || !previousClose) return null;
    
    const changePct = ((currentPrice - previousClose) / previousClose) * 100;
    
    return {
      price: currentPrice.toFixed(2),
      changePct: changePct.toFixed(2),
      currency: meta.currency
    };
  } catch (error) {
    logger.error('Night Scanner', `獲取 ${ticker} 報價失敗`, error);
    return null;
  }
};

/**
 * 執行夜盤掃描 (主要監控美股 ADR 走勢)
 * 只要漲跌幅 > 2% 就發送警報 (每天每檔限發送一次，避免洗版)
 */
export const scanNightSession = async () => {
  logger.info('Night Scanner', '🌙 開始掃描夜盤 (ADR) 走勢...');
  const today = new Date().toISOString().split('T')[0];

  for (const [ticker, info] of Object.entries(ADR_MAPPING)) {
    const quote = await fetchYahooQuote(ticker);
    if (!quote) continue;

    const changePct = parseFloat(quote.changePct);
    
    // 判斷是否大漲或大跌超過 2%
    if (Math.abs(changePct) >= 2.0) {
      const alertKey = `NIGHT_ALERT_${ticker}_${today}`;
      const hasAlerted = getSetting(alertKey);
      
      if (!hasAlerted) {
        logger.info('Night Scanner', `🚨 發現夜盤劇烈波動: ${info.name} (${ticker}) ${changePct > 0 ? '+' : ''}${changePct}%`);
        
        // 記錄到雷達信號庫
        const signal = {
          symbol: info.symbol,
          name: info.name,
          signal_type: 'NIGHT_SESSION',
          ai_stars: Math.abs(changePct) >= 4 ? 5 : 4,
          ai_sentiment: changePct > 0 ? 'BULLISH' : 'BEARISH',
          ai_reasoning: `【夜盤/ADR 劇烈波動警報】\n美股對應標的 ${ticker} 目前報價 ${quote.price} ${quote.currency}，漲跌幅達 ${changePct > 0 ? '+' : ''}${quote.changePct}%。\n暗示明日台股開盤極可能出現強烈跳空缺口，請密切注意！`,
          news_headline: `夜盤/ADR 波動大於 2%`,
          current_price: 0,
          volume_ratio: 0
        };
        addRadarSignal(signal);

        // 獨立推送邏輯
        const { getBot } = await import('../notify/telegram.js');
        const bot = getBot();
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (bot && chatId) {
          const isUp = changePct > 0;
          const html = `🌙 <b>夜盤劇烈波動警報</b>
          
<b>股票：</b> <code>${info.symbol}</code> (${info.name})
<b>對應標的：</b> ${ticker} (美股 ADR)
<b>目前狀態：</b> ${isUp ? '🚀 夜盤大漲' : '🩸 夜盤重挫'}
<b>即時漲跌幅：</b> <code>${isUp ? '+' : ''}${quote.changePct}%</code>
<b>最新報價：</b> ${quote.price} ${quote.currency}

⚠️ <i>這暗示明天台股開盤 ${info.name} 極可能會出現明顯跳空，請提前做好準備！</i>`;
          
          try {
            await bot.sendMessage(chatId, html, { parse_mode: 'HTML' });
            setSetting(alertKey, 'true');
          } catch (e) {
            logger.error('Night Scanner', 'Telegram 推播失敗', e);
          }
        }
      }
    }
  }
};
