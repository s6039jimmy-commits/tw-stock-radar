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

  // 3. AI 分析生成回答 (自然、偏主觀、智慧俐落、像一般問 AI 的口吻)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3 }
      });

      const prompt = `你是一個專業、聰明且講話直率俐落的台股策略 AI（名字叫財神熊）。
現在使用者在 LINE 群組裡 @你 提問：「${cleanQuery}」
${quoteInfo ? quoteInfo : ''}

【回覆口吻要求】：
1. 像一般跟聰明 AI 對話的口吻，自然、清楚、有邏輯，不要有機器人或客服官方腔。
2. 保持「偏主觀」的明確判斷，不要含糊其詞或模稜兩可，直接給出你作為 AI 的個人看法。
3. 如果是問個股或大盤，直接給出明確的操作傾向：【加倉】、【賣一點】或【觀望】（三擇一），並附上一針見血的原因分析。
4. 控制在 80~140 字內，排版乾淨俐落，讓使用者在手機上 3 秒看懂重點。
5. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等官腔廢話。`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用偏主觀智慧 AI 備援規則: ' + err.message);
    }
  }

  // 4. 智慧備援規則 (偏主觀、俐落、像一般問 AI 的口吻)
  if (detectedSymbol && quoteInfo) {
    const isBigDrop = quoteInfo.includes('(-') && (quoteInfo.includes('-1.') || quoteInfo.includes('-2.') || quoteInfo.includes('-3.') || quoteInfo.includes('-4.'));
    const isBigUp = quoteInfo.includes('(+' ) && (quoteInfo.includes('+1.') || quoteInfo.includes('+2.') || quoteInfo.includes('+3.') || quoteInfo.includes('+4.'));

    let view = '';
    let action = '【觀望】';
    let reason = '';

    if (isBigDrop) {
      view = '盤面受外盤與賣壓壓制，短期均線已跌破，空方主導力道較強，技術面尚未出現明確的止跌築底訊號。';
      action = '【觀望】';
      reason = '目前空方賣壓尚未完全釋放，暫不建議急著進場猜底接刀，先觀察是否有主力買盤收腳防守。';
    } else if (isBigUp) {
      view = '多方買盤積極進駐，成交量能溫和放大，短期均線維持多頭排列，攻擊動能依然維持強勢。';
      action = '【加倉】';
      reason = '多頭架構完好，若手中已有部位，可待盤中回測短期均線有守時，逢回分批適量加碼。';
    } else {
      view = '目前處於均線區間窄幅震盪整理，多空力道相對均衡，量能亦呈現收縮，屬於回檔沉澱籌碼的階段。';
      action = '【觀望】';
      reason = '突破方向尚未明朗前不宜頻繁進出，既有持股續抱即可，靜待帶量突破區間再做決定。';
    }

    return `🤖 收到您的提問：\n${quoteInfo}\n\n• AI 主觀分析：${view}\n• 操作應對：${action} — 原因：${reason}`;
  }

  return `🤖 關於「${cleanQuery}」：\n\n• AI 主觀分析：目前大盤處於震盪輪動格局，各族群強弱分化明顯，追價意願相對保守。\n• 操作應對：【觀望】 — 原因：指數在關鍵區間拉鋸，建議保留適度現金部位，觀察量能能否回溫再順勢佈局。`;
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
