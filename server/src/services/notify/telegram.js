import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { addPosition, getSetting, setSetting } from '../../db/database.js';

let botInstance = null;
let currentToken = null;

export const getBot = (overrideToken = null) => {
  const token = overrideToken || process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  if (!botInstance || currentToken !== token) {
    try {
      botInstance = new TelegramBot(token, { polling: true });
      currentToken = token;
      logger.info('Telegram', 'Telegram Bot 初始化成功，已開啟 Polling 模式');
      
      // 處理 Inline Keyboard 按鈕點擊
      botInstance.on('callback_query', async (query) => {
        try {
          const action = query.data;
          const chatId = query.message.chat.id;
          
          if (action.startsWith('ENTER:')) {
            // Format: ENTER:symbol:price:stars:name
            const parts = action.split(':');
            const symbol = parts[1];
            const price = parseFloat(parts[2]);
            const stars = parseInt(parts[3] || '0', 10);
            const name = parts.slice(4).join(':'); // The rest is name
            
            try {
              await addPosition({
                symbol,
                name: name || symbol,
                entry_price: price,
                entry_date: new Date().toISOString(),
                entry_reason: 'Telegram 互動按鈕確認進場',
                ai_stars: stars
              });
              
              await botInstance.answerCallbackQuery(query.id, { text: `✅ 已成功建立 ${name} 持倉！` });
              await botInstance.sendMessage(chatId, `🟢 <b>成功建倉</b>\n已將 <code>${symbol}</code> ${name} (進場價 NT$ ${price}) 加入持倉監控！\n系統將自動套用預設停損停利設定。`, { parse_mode: 'HTML' });
            } catch (err) {
              await botInstance.answerCallbackQuery(query.id, { text: `❌ 建立持倉失敗: ${err.message}`, show_alert: true });
            }
          }
        } catch (e) {
          logger.error('Telegram', '處理 callback_query 失敗', e);
        }
      });
    } catch (e) {
      logger.error('Telegram', 'Bot 初始化失敗', e);
      return null;
    }
  }
  return botInstance;
};

export const initTelegramBot = () => {
  const bot = getBot();
  if (bot) {
    logger.info('Telegram', 'Telegram 服務已啟動並等待指令...');
  }
};

const sendHTML = async (html, replyMarkup = null, overrideChatId = null) => {
  const bot = getBot();
  const chatId = overrideChatId || process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID;
  
  if (!bot || !chatId) {
    logger.warn('Telegram', '未設定 Bot Token 或 Chat ID，無法發送訊息');
    return false;
  }
  
  try {
    const opts = { parse_mode: 'HTML' };
    if (replyMarkup) opts.reply_markup = replyMarkup;
    await bot.sendMessage(chatId, html, opts);
    logger.info('Telegram', '訊息發送成功');
    return true;
  } catch (error) {
    logger.error('Telegram', '發送訊息失敗: ' + error.message);
    return false;
  }
};

export const sendEntrySignal = async (signal) => {
  if (signal.ai_stars < 5) {
    logger.info('Telegram', `信號 ${signal.symbol} 僅 ${signal.ai_stars} 星，未達 5 星推播門檻，跳過推播。`);
    return false;
  }

  const today = new Date().toISOString().split('T')[0];
  const savedDate = await getSetting('DAILY_PUSH_DATE');
  let pushCount = parseInt(await getSetting('DAILY_PUSH_COUNT') || '0', 10);
  
  if (savedDate !== today) {
    pushCount = 0;
    await setSetting('DAILY_PUSH_DATE', today);
  }

  if (pushCount >= 1) {
    logger.info('Telegram', `今日推播已達上限 (1 筆)，跳過信號 ${signal.symbol}`);
    return false;
  }

  const stars = '⭐'.repeat(signal.ai_stars || 4);
  
  let directionText = '🟢 偏多 (做多)';
  let actionEmoji = '📈';
  if (signal.ai_sentiment === 'BEARISH') {
    directionText = '🔴 偏空 (做空)';
    actionEmoji = '📉';
  } else if (signal.ai_sentiment === 'NEUTRAL') {
    directionText = '⚪ 中立 (觀望)';
    actionEmoji = '➖';
  }

  const html = `🎯 <b>AI 台股進場訊號警報</b>

<b>股票：</b> <code>${signal.symbol}</code> (${signal.name})
<b>方向：</b> ${directionText}
<b>類型：</b> ${signal.signal_type === 'BLUE_CHIP' ? '🏛️ 大型權值股' : '🚀 爆量飆股'}
<b>AI 信心度：</b> ${stars} (${signal.ai_stars} 顆星)
<b>目前價格：</b> <code>NT$ ${signal.current_price}</code>
<b>量比：</b> <code>${signal.volume_ratio ? Number(signal.volume_ratio).toFixed(1) + 'x' : '1.0x'}</code>

<b>AI 策略分析：</b>
<pre>${signal.ai_reasoning || '無詳細推理'}</pre>

<b>觸發新聞：</b>
<i>${signal.news_headline || '市場爆量突破'}</i>`;
  
  const callbackData = `ENTER:${signal.symbol}:${signal.current_price}:${signal.ai_stars}:${signal.name}`.substring(0, 64);
  
  const markup = {
    inline_keyboard: [
      [{ text: `${actionEmoji} 是，我要進場 (加入監控)`, callback_data: callbackData }],
      [
        { text: '📈 TradingView', url: `https://tw.tradingview.com/chart/?symbol=TWSE:${signal.symbol}` },
        { text: '📰 鉅亨網', url: `https://news.cnyes.com/news/keyword/${signal.symbol}` }
      ]
    ]
  };
  
  const success = await sendHTML(html, markup);
  if (success) {
    await setSetting('DAILY_PUSH_COUNT', (pushCount + 1).toString());
  }
  return success;
};

export const sendExitAlert = (alert, position, profitPct = null) => {
  const emojis = { STOP_LOSS: '🚨 停損警報', TAKE_PROFIT: '🎉 停利警報', MA5_BREAK: '⚠️ 跌破 MA5', NEWS_EXIT: '🏃 風向逃命' };
  
  let pnlText = '';
  if (profitPct !== null) {
    const isProfit = profitPct > 0;
    pnlText = `\n<b>預估損益：</b> ${isProfit ? '💰 獲利' : '💸 虧損'} <code>${profitPct > 0 ? '+' : ''}${profitPct.toFixed(2)}%</code>\n`;
  }

  const html = `${emojis[alert.alert_type] || '🔔 出場警報'}

<b>股票：</b> <code>${alert.symbol}</code> (${position.name || alert.symbol})
<b>進場價格：</b> <code>NT$ ${position.entry_price}</code>
<b>觸發價格：</b> <code>NT$ ${alert.trigger_price}</code>${pnlText}
<b>觸發原因：</b> ${alert.trigger_reason}

<b>AI 出場分析建議：</b>
<pre>${alert.ai_analysis || '符合技術面出場紀律，建議立即停損/停利。'}</pre>`;
  
  return sendHTML(html);
};

export const sendDailySummary = (stats, marketSummary = '') => {
  const winRate = stats.winRate.toFixed(1);
  const avgProfit = stats.avgProfitPct.toFixed(2);
  let performanceStr = '';

  if (stats.totalTrades === 0) {
    performanceStr = '目前我們還沒有完成任何一筆交易，別心急，好獵人懂得耐心等待大魚上鉤！';
  } else if (stats.avgProfitPct > 0) {
    performanceStr = `這陣子我們總共操作了 <b>${stats.totalTrades}</b> 筆交易。\n整體勝率維持在 <b>${winRate}%</b>，平均每筆幫您賺了 <b>+${avgProfit}%</b> 💰\n績效很漂亮，我們繼續保持這個紀律，讓利潤奔跑！`;
  } else {
    performanceStr = `這陣子我們總共操作了 <b>${stats.totalTrades}</b> 筆交易。\n整體勝率是 <b>${winRate}%</b>，平均每筆虧損了 <b>${avgProfit}%</b> 🩸\n最近盤勢可能比較不好做，不過別擔心，系統會嚴格幫您執行停損，保護本金最重要！`;
  }

  let marketStr = '';
  if (marketSummary) {
    marketStr = `\n<b>📝 今日大盤閒聊：</b>\n<i>「${marketSummary}」</i>\n`;
  }

  const html = `📊 <b>【本日收盤結算報告】</b>

老闆，今天辛苦了！台股已經順利收盤囉。
${marketStr}
<b>🎯 您的專屬戰績報告：</b>
${performanceStr}

<i>☕ 晚上好好休息，明天早上 08:30 系統會準時把最新的早報跟 5 星名單送過來！</i>`;
  return sendHTML(html);
};

export const sendTestMessage = async (customToken = null, customChatId = null) => {
  const bot = getBot(customToken);
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID;
  
  if (!bot || !chatId) {
    return { success: false, message: '請提供有效的 Bot Token 與 Chat ID' };
  }

  try {
    await bot.sendMessage(chatId, `🚀 <b>AI 台股全天候策略雷達系統</b>\n\n✅ <b>Telegram 推播連線測試成功！</b>\n你將會在此收到最新 4 星以上進場訊號與即時出場警報。`, { parse_mode: 'HTML' });
    return { success: true, message: '測試訊息已成功送出！請至 Telegram 查看。' };
  } catch (error) {
    return { success: false, message: '發送失敗: ' + error.message };
  }
};
