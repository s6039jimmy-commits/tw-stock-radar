import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 常見熱門股代碼對應
const STOCK_NAME_MAP = {
  '台積電': '2330',
  '鴻海': '2317',
  '聯發科': '2454',
  '廣達': '2382',
  '大盤': 'IX0001',
  '加權指數': 'IX0001',
  '0050': '0050',
  '0056': '0056',
  '006208': '006208',
  '00919': '00919',
  '00929': '00929'
};

/**
 * 回覆 LINE 訊息 (使用 replyToken，不消耗每月的 200 則 Push 額度，完全免費)
 */
export const replyLineMessage = async (replyToken, text) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || await import('./line.js').then(m => m.sendLineMessage ? null : null);
  // 直接透過 line.js 取得最新動態 token
  const { sendLineMessage } = await import('./line.js');
  // 從 line.js 獲取動態 token 支援
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken && channelId && channelSecret) {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', channelId);
    params.append('client_secret', channelSecret);
    const res = await axios.post('https://api.line.me/v2/oauth/accessToken', params);
    accessToken = res.data.access_token;
  }

  if (!accessToken || !replyToken) return false;

  try {
    const res = await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [{ type: 'text', text }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );
    return res.status === 200;
  } catch (error) {
    logger.error('LINEReply', '回覆失敗: ' + (error.response?.data?.message || error.message));
    return false;
  }
};

/**
 * 分析群組使用者對機器人的提問，並產出高情商、大白話的解答
 */
export const processUserQuestion = async (userText) => {
  // 1. 去除 @提及 標籤，取得乾淨的使用者提問
  const cleanQuery = userText.replace(/@\S+/g, '').trim();
  if (!cleanQuery) {
    return '老闆您好！有什麼股市問題想問我嗎？例如：\n• @我 2330 怎麼看？\n• @我 大盤今天還能追嗎？\n• @我 006208 能加碼嗎？';
  }

  // 2. 檢查是否有提及個股代碼或股票名稱
  let detectedSymbol = null;
  const symbolMatch = cleanQuery.match(/\b\d{4,6}\b/);
  if (symbolMatch) {
    detectedSymbol = symbolMatch[0];
  } else {
    for (const [name, sym] of Object.entries(STOCK_NAME_MAP)) {
      if (cleanQuery.includes(name)) {
        detectedSymbol = sym;
        break;
      }
    }
  }

  let quoteInfo = '';
  if (detectedSymbol) {
    try {
      const q = await getQuote(detectedSymbol);
      if (q) {
        const price = q.closePrice || q.lastPrice || 0;
        const change = parseFloat(q.change || 0);
        const changePct = parseFloat(q.changePercent || 0);
        const sign = change >= 0 ? '+' : '';
        const name = q.name || detectedSymbol;
        quoteInfo = `\n【${detectedSymbol} ${name} 即時行情】：成交價 NT$ ${price} (${sign}${change} / ${sign}${changePct}%)`;
      }
    } catch (e) {
      logger.warn('LINEReply', `查詢報價 ${detectedSymbol} 失敗: ` + e.message);
    }
  }

  // 3. AI 分析生成回答
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.2 }
      });

      const prompt = `你是一個專業、親切、口氣大白話的台股 AI 策略助理（名字叫財神熊）。
現在使用者在 LINE 群組裡 @你 提問：「${cleanQuery}」
${quoteInfo ? quoteInfo : ''}

請用最簡單、好懂、秒懂的文字（不要用艱深術語）回答他：
1. 一針見血點出重點。
2. 如果是問股票或大盤，直接明確給出應對建議：【加倉】、【賣一點】或【觀望】（三擇一），並接一句大白話原因。
3. 語氣熱情有禮，字數控制在 100~150 字內，排版清楚好讀。
4. 絕對嚴禁提到「老手」、「投資盈虧自負」、「請謹慎評估」等官腔廢話。`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用智慧備援規則: ' + err.message);
    }
  }

  // 4. 智慧備援規則 (若 Gemini 402 或無 API Key)
  if (detectedSymbol && quoteInfo) {
    return `🐻 老闆您好！收到您的提問：\n${quoteInfo}\n\n• 盤面建議：目前技術面處於整理關鍵區，若未跌破 5 日均線可安心續抱。\n• 操作應對：【觀望】— 原因：等待成交量能放大確認突破方向，先不急著追高，守穩支撐再分批低接！`;
  }

  return `🐻 老闆您好！關於「${cleanQuery}」：\n目前大盤處於震盪輪動格局，操作上建議【觀望】— 保留適度現金，切勿盲目追高，等待主流族群回檔守穩均線再進場！`;
};

/**
 * 處理 Webhook 收到的訊息事件
 */
export const handleLineWebhookEvent = async (event) => {
  if (event.type !== 'message' || event.message?.type !== 'text') {
    return false;
  }

  const text = event.message.text.trim();
  const replyToken = event.replyToken;

  // 判斷是否為群組訊息
  const isGroup = event.source?.type === 'group' || event.source?.type === 'room';

  if (isGroup) {
    // 在群組內：只有當 @機器人 或 提到「財神熊」或 開頭包含「@」或「?」才觸發回覆
    const isMentioned = event.message.mention?.mentees?.some(m => m.isSelf === true) 
      || text.includes('@') 
      || text.includes('財神熊') 
      || text.startsWith('!')
      || text.startsWith('/');

    if (!isMentioned) {
      return false; // 在群組裡平常聊天不打擾
    }
  }

  logger.info('LINEReply', `收到提問: "${text}" (replyToken: ${replyToken})`);
  const replyContent = await processUserQuestion(text);
  const ok = await replyLineMessage(replyToken, replyContent);
  logger.info('LINEReply', `回覆結果: ${ok ? '成功' : '失敗'}`);
  return ok;
};
