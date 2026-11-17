import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { addPosition, getSetting, setSetting } from '../../db/database.js';
import { sendLineMessage } from './line.js';

let botInstance = null;
let currentToken = null;

export const getBot = (overrideToken = null) => {
  const token = overrideToken || process.env.TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  if (!botInstance || currentToken !== token) {
    try {
      botInstance = new TelegramBot(token, { polling: false });
      currentToken = token;
      logger.info('Telegram', 'Telegram Bot 初始化成功 (Webhook/Push 模式，無 Polling 衝突)');
      
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

export const sendHTML = async (html, replyMarkup = null, overrideChatId = null) => {
  // 同步支援 LINE 推播 (若環境變數已設定 LINE Token 與 Group/User ID)
  let lineSuccess = false;
  try {
    lineSuccess = await sendLineMessage(html);
  } catch (err) {
    logger.error('LINE', 'LINE 推播異常: ' + err.message);
  }

  const bot = getBot();
  const rawChatId = overrideChatId || process.env.TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID;
  
  if (!bot || !rawChatId) {
    if (lineSuccess) return true;
    logger.warn('Telegram', '未設定 Bot Token 或 Chat ID，無法發送 Telegram 訊息');
    return false;
  }
  
  const chatIds = String(rawChatId).split(',').map(s => s.trim()).filter(Boolean);
  let anySuccess = false;
  for (const chatId of chatIds) {
    try {
      const opts = { parse_mode: 'HTML' };
      if (replyMarkup) opts.reply_markup = replyMarkup;
      await bot.sendMessage(chatId, html, opts);
      anySuccess = true;
    } catch (error) {
      logger.error('Telegram', `發送訊息至 ${chatId} 失敗: ` + error.message);
    }
  }
  if (anySuccess) {
    logger.info('Telegram', `訊息發送成功 (${chatIds.length} 個聊天室/群組)`);
  }
  return anySuccess;
};

export const sendEntrySignal = async (signal) => {
  // 依使用者指示：全面關閉個股進場訊號推播，改為純 14:05 大盤指數推播
  logger.info('Telegram', `[已停用推播] 依使用者指示，全面封鎖個股訊號推播: ${signal.symbol} (${signal.name || signal.symbol})`);
  return false;
};

export const sendExitAlert = (alert, position, profitPct = null) => {
  // 依使用者指示：全面關閉停損停利與破線出場推播，保持 Telegram 清爽
  logger.info('Telegram', `[已停用推播] 依使用者指示，不發送出場警報: ${alert.symbol} (${alert.alert_type})`);
  return false;
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

<i>☕ 晚上好好休息，明天早上 08:30 系統會準時把最新的早報跟 4 星以上強勢名單送過來！</i>`;
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

/**
 * 🎯 使用者專屬選股雷達推播 (customScanner 專用)
 * 只在 AI 審核通過 5 星才呼叫此函式
 */
export const sendCustomSignal = async (signal) => {
  const html = `🎯 <b>【專屬選股雷達】5 星強勢訊號</b>

<b>${signal.symbol}</b> ${signal.name !== signal.symbol ? signal.name : ''}
💰 昨收：<code>NT$${signal.current_price}</code>
📌 <b>利多理由：</b>${signal.ai_reasoning}
📊 <b>籌碼：</b>${signal.extra || ''}

⚡ <b>條件全通過：</b>
  ✅ 股價 ≥ 50 元
  ✅ 外資 + 投信同步買超
  ✅ 近 20 日最高收盤（突破月高點）
  ✅ AI 審核：實質業績利多（5 星）

⚠️ <i>此為盤前訊號，開盤後請自行確認量能與走勢後再決策。</i>`;

  return sendHTML(html);
};
