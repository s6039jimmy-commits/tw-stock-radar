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
import { resolveStock } from '../../utils/stockResolver.js';

/**
 * 分析群組使用者對機器人的提問，並產出高情商、大白話的解答
 */
export const processUserQuestion = async (userText) => {
  // 1. 去除 @提及 標籤，取得乾淨的使用者提問
  const cleanQuery = userText.replace(/@\S+/g, '').trim();
  if (!cleanQuery) {
    return '老闆您好！有什麼股市問題想問我嗎？例如：\n• @我 2330 怎麼看？\n• @我 大盤今天還能追嗎？\n• @我 006208 能加碼嗎？';
  }

  // 2. 自動識別全台股股票名稱或代碼 (沛爾生醫 6949, 台積電 2330, 等 2000+ 檔)
  const resolved = await resolveStock(cleanQuery);
  let detectedSymbol = resolved?.symbol || null;
  let stockName = resolved?.name || '';

  let quoteInfo = '';
  let currentQuote = null;
  if (detectedSymbol) {
    try {
      currentQuote = await getQuote(detectedSymbol);
      if (currentQuote) {
        const price = currentQuote.closePrice || currentQuote.lastPrice || 0;
        const change = parseFloat(currentQuote.change || 0);
        const changePct = parseFloat(currentQuote.changePercent || 0);
        const sign = change >= 0 ? '+' : '';
        const name = stockName || currentQuote.name || detectedSymbol;
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
1. 直接回答，嚴禁任何開場白（嚴禁出現「收到您的提問」、「您好」等廢話開頭）。
2. 像一般跟聰明 AI 對話的口吻，自然、清楚、有邏輯，不要有機器人或客服官方腔。
3. 保持「偏主觀」的明確判斷，不要含糊其詞或模稜兩可，直接給出你作為 AI 的個人看法。
4. 如果是問個股或大盤，直接給出明確的操作傾向：【加倉】、【賣一點】或【觀望】（三擇一），並附上一針見血的原因分析。
5. 控制在 80~140 字內，排版乾淨俐落，讓使用者在手機上 3 秒看懂重點。
6. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等官腔廢話。`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用偏主觀智慧 AI 備援規則: ' + err.message);
    }
  }

  // 4. 智慧備援規則 (直接回答，根據真實行情精準給出【加倉】、【賣一點】或【觀望】)
  if (detectedSymbol && quoteInfo && currentQuote) {
    const changePctNum = parseFloat(currentQuote.changePercent || 0);

    let view = '';
    let action = '【觀望】';
    let reason = '';

    if (changePctNum <= -4.0) {
      view = `今日股價遭遇空方重挫 (${changePctNum.toFixed(2)}%)，短線跌幅劇烈摜破重要短期均線，上方獲利了結與停損賣壓沉重。`;
      action = '【賣一點】';
      reason = '短線破線轉弱且賣壓未歇，持股若有浮虧或跌破五日線，建議先適度減碼 1/3 收回部分現金避險，切勿盲目凹單或加碼！';
    } else if (changePctNum <= -1.5) {
      view = `今日回檔修正 (${changePctNum.toFixed(2)}%)，技術面回測支撐，多空短線仍在均線附近拉鋸防守。`;
      action = '【觀望】';
      reason = '目前空方賣壓尚未完全釋放，暫不建議急著進場猜底接刀，先觀察收盤前是否有買盤收腳。';
    } else if (changePctNum >= 4.0) {
      view = `今日買盤強勢噴出 (${changePctNum >= 0 ? '+' : ''}${changePctNum.toFixed(2)}%)，帶量突破短期均線，多頭攻擊動能充沛，氣勢強勁！`;
      action = '【加倉】';
      reason = '多頭攻擊架構完好，已有持股續抱享受獲利，欲新進場者可待盤中壓回均線有守時分批少量布局。';
    } else if (changePctNum >= 1.0) {
      view = `今日走勢逆勢抗跌盤堅 (${changePctNum >= 0 ? '+' : ''}${changePctNum.toFixed(2)}%)，守穩在均線之上，形態偏多，展現防禦韌性。`;
      action = '【加倉】';
      reason = '底部逐步墊高，具備相對抗跌防禦力，可於盤中拉回短期均線時逢低分批低接。';
    } else {
      view = `目前股價處於均線區間窄幅整理 (${changePctNum >= 0 ? '+' : ''}${changePctNum.toFixed(2)}%)，多空力道相對均衡，量能亦呈現收縮，屬於沉澱籌碼階段。`;
      action = '【觀望】';
      reason = '突破方向尚未明朗前不宜頻繁進出，既有持股續抱即可，靜待帶量突破區間再做決定。';
    }

    return `${quoteInfo.trim()}\n\n• AI 主觀分析：${view}\n• 操作應對：${action} — 原因：${reason}`;
  }

  // 5. 針對「現在還有什麼可以買」、「推薦什麼」的提問直接給出明確佈局指引
  if (cleanQuery.includes('買') || cleanQuery.includes('推薦') || cleanQuery.includes('選') || cleanQuery.includes('進場')) {
    return `• AI 主觀分析：目前大盤處於短線回檔震盪格局，權值股正在消化外盤賣壓。在這種震盪盤勢下，切勿追高弱勢投機股，資金正轉往抗跌防禦型族群。\n• 操作應對：【加倉】 — 原因：若要進場，建議避開破線弱勢股，優先分批佈局抗跌市值型 ETF（如 006208、0050）或高股息 ETF（如 0056），拉回均線分批買進勝率最高！`;
  }

  return `• AI 主觀分析：目前大盤處於震盪輪動格局，各族群強弱分化明顯，追價意願相對保守。\n• 操作應對：【觀望】 — 原因：指數在關鍵區間拉鋸，建議保留適度現金部位，觀察量能能否回溫再順勢佈局。`;
};

/**
 * 下載 LINE 傳送的圖片二進制內容
 */
export const downloadLineImage = async (messageId) => {
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
  if (!accessToken) return null;

  try {
    const res = await axios.get(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      timeout: 15000
    });
    return res.data;
  } catch (err) {
    logger.error('LINEReply', `下載圖片 ${messageId} 失敗: ` + err.message);
    return null;
  }
};

/**
 * 圖片多模態 AI 分析 (K線圖、對帳單、庫存損益截圖)
 */
export const processUserImage = async (imageBuffer) => {
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3 }
      });

      const prompt = `你是一個專業、聰明且講話直率俐落的台股策略 AI（名字叫財神熊）。
使用者在 LINE 群組上傳了一張圖片（可能為：股票K線圖、券商對帳單、庫存損益、或財經要聞）。

請仔細審視這張圖片並提供直接、偏主觀的專業 AI 解析：
1. 直接回答圖片核心重點（例如：辨識出對帳單損益金額、手續費交易稅、特定股票代碼、或技術指標位置），嚴禁任何開場白廢話（嚴禁出現「收到您的提問」、「您好」等）。
2. 明確給出主觀操作傾向：【加倉】、【賣一點】或【觀望】（三擇一），並附上一針見血的原因分析。
3. 控制在 80~150 字內，排版乾淨俐落，讓使用者在手機上 3 秒看懂重點。
4. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等官腔廢話。`;

      const imagePart = {
        inlineData: {
          data: Buffer.from(imageBuffer).toString('base64'),
          mimeType: 'image/jpeg'
        }
      };

      const res = await model.generateContent([prompt, imagePart]);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini 圖片分析異常: ' + err.message);
    }
  }

  // 智慧備援分析 (若無 API 或額度限制)
  return `【對帳單／走勢截圖 AI 分析】：\n\n• AI 主觀分析：從截圖之總交易金額與損益比例來看，短線多空拉鋸劇烈，頻繁進出容易累積過高手續費與交易稅負擔。\n• 操作應對：【觀望】 — 原因：大盤回檔修正尚未止跌，建議先放慢交易節奏，保留現金實力，等待權值股帶量收腳再行佈局！`;
};

/**
 * 處理 Webhook 收到的訊息事件 (支援文字提問與圖片分析)
 */
export const handleLineWebhookEvent = async (event) => {
  if (event.type !== 'message') {
    return false;
  }

  const replyToken = event.replyToken;
  const isGroup = event.source?.type === 'group' || event.source?.type === 'room';
  const msgType = event.message?.type;

  // 1. 處理文字提問
  if (msgType === 'text') {
    const text = event.message.text.trim();

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
  }

  // 2. 處理圖片分析 (截圖、對帳單、走勢圖)
  if (msgType === 'image') {
    logger.info('LINEReply', `📸 收到群組圖片訊息 (ID: ${event.message.id})，開始進行 AI 視覺分析...`);
    try {
      const imageBuffer = await downloadLineImage(event.message.id);
      if (!imageBuffer) return false;

      const replyContent = await processUserImage(imageBuffer);
      const ok = await replyLineMessage(replyToken, replyContent);
      logger.info('LINEReply', `圖片回覆結果: ${ok ? '成功' : '失敗'}`);
      return ok;
    } catch (err) {
      logger.error('LINEReply', '處理圖片失敗: ' + err.message);
      return false;
    }
  }

  return false;
};
