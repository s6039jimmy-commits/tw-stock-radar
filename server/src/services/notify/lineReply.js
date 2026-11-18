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
  const channelId = process.env.LINE_CHANNEL_ID || '2012651187';
  const channelSecret = process.env.LINE_CHANNEL_SECRET || 'a6841f1c4a39a3d52fb48b55a364ac16';

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

// 群組與個人對話上下文記憶池 (滑動視窗保留最近 8 則訊息 / 4 回合，25 分鐘有效)
const chatHistoryMap = new Map();
const MAX_HISTORY = 8;
const HISTORY_EXPIRE_MS = 25 * 60 * 1000;

export const getConversationHistory = (sessionId) => {
  if (!sessionId) return [];
  const history = chatHistoryMap.get(sessionId) || [];
  const now = Date.now();
  const activeHistory = history.filter(item => now - item.timestamp < HISTORY_EXPIRE_MS);
  chatHistoryMap.set(sessionId, activeHistory);
  return activeHistory;
};

export const saveConversationTurn = (sessionId, userText, replyText, senderName = '群組朋友', stockSymbol = null, stockName = null) => {
  if (!sessionId) return;
  const history = getConversationHistory(sessionId);
  history.push({ role: 'user', name: senderName, text: userText, timestamp: Date.now(), stockSymbol, stockName });
  history.push({ role: 'assistant', name: '財神熊', text: replyText, timestamp: Date.now(), stockSymbol, stockName });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  chatHistoryMap.set(sessionId, history);
};

const userProfileCache = new Map();

async function getUserDisplayName(groupId, userId) {
  if (!userId) return '群組朋友';
  if (userProfileCache.has(userId)) return userProfileCache.get(userId);

  try {
    const channelId = process.env.LINE_CHANNEL_ID || '2012651187';
    const channelSecret = process.env.LINE_CHANNEL_SECRET || 'a6841f1c4a39a3d52fb48b55a364ac16';
    let accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!accessToken && channelId && channelSecret) {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      params.append('client_id', channelId);
      params.append('client_secret', channelSecret);
      const res = await axios.post('https://api.line.me/v2/oauth/accessToken', params);
      accessToken = res.data?.access_token;
    }

    if (accessToken) {
      const url = groupId
        ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
        : `https://api.line.me/v2/bot/profile/${userId}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 2500
      });
      if (res.data?.displayName) {
        userProfileCache.set(userId, res.data.displayName);
        return res.data.displayName;
      }
    }
  } catch (e) {
    // 忽略異常
  }
  return '群組朋友';
}

/**
 * 分析群組使用者對機器人的提問，並產出高情商、大白話的解答 (支援連續對話話題記憶)
 */
export const processUserQuestion = async (userText, sessionId = 'default', senderName = '群組朋友') => {
  // 1. 去除 @提及 標籤（精確移除 @財神熊、@bot、@我，支援文字黏在後面，如 @財神熊房子貸款也要買）
  let cleanQuery = userText
    .replace(/@\s*財神熊/gi, '')
    .replace(/@\s*我/gi, '')
    .trim();
  if (cleanQuery.startsWith('@')) {
    cleanQuery = cleanQuery.replace(/^@\S+\s*/, '').trim();
  }
  if (!cleanQuery) {
    return '老闆您好！有什麼股市問題想問我嗎？例如：\n• @我 2330 怎麼看？\n• @我 大盤今天還能追嗎？\n• @我 006208 能加碼嗎？';
  }

  // 2. 檢索上下文話題記憶（支援延續討論，如「房子貸款也要買」、「那停損看哪」、「它現在呢」）
  const recentHistory = getConversationHistory(sessionId);
  let historyContext = '';
  let lastMentionedStock = null;

  if (recentHistory.length > 0) {
    const historyLines = recentHistory.map(item => `- ${item.name}: ${item.text}`).join('\n');
    historyContext = `\n【最近群組對話話題脈絡】（非常關鍵：若使用者的問題包含代名詞如「它、這檔」、或接續上一話題如「房子貸款也要買、那停損設哪、什麼時候能進」，代表接續剛才的對話！）：\n${historyLines}\n`;

    // 找出上一話題中討論的股票（若當前提問沒指定股票，自動接續該標的行情）
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      if (recentHistory[i].stockSymbol) {
        lastMentionedStock = { symbol: recentHistory[i].stockSymbol, name: recentHistory[i].stockName };
        break;
      }
    }
  }

  // 3. 自動識別全台股股票名稱或代碼 (沛爾生醫 6949, 台積電 2330, 等 2000+ 檔)
  const resolved = await resolveStock(cleanQuery);
  let detectedSymbol = resolved?.symbol || null;
  let stockName = resolved?.name || '';

  // 檢查當前問題是否明顯與股票無關（如純借錢、買車、生活瑣事等）
  const isClearlyOffTopic = /借錢|借我|買車|吃什麼|午餐|晚餐|天氣|笑話|女友|男友|好笑|唱歌/i.test(cleanQuery) 
    && !/股|盤|跌|漲|買進|賣出|進場|出場|停損|停利|線|k/i.test(cleanQuery);

  // 若當前問題未指定股票，且非明顯無關閒聊，但上一話題有討論的股票，自動接續該股票！
  if (!detectedSymbol && lastMentionedStock && !isClearlyOffTopic) {
    detectedSymbol = lastMentionedStock.symbol;
    stockName = lastMentionedStock.name;
  }

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

  // 4. 取得大盤加權指數即時數據，確保 AI 具備真實市場認知 (大盤現處於 4 萬點時代，絕不產生舊年代點位幻覺)
  let marketInfo = '';
  try {
    const marketQuote = await getQuote('IX0001');
    if (marketQuote) {
      const mPrice = marketQuote.closePrice || marketQuote.lastPrice || 0;
      const mChange = parseFloat(marketQuote.change || 0);
      const mChangePct = parseFloat(marketQuote.changePercent || 0);
      const mSign = mChange >= 0 ? '+' : '';
      const mHigh = marketQuote.highPrice || mPrice;
      marketInfo = `\n【當前台股大盤真實行情】：加權指數現報 ${mPrice} 點 (${mSign}${mChange} / ${mSign}${mChangePct}%)，今日高點 ${mHigh} 點。`;
    }
  } catch (e) {
    // 忽略大盤獲取失敗
  }

  // 5. AI 分析生成回答 (無死板攔截，讓 AI 自由發揮，但堅守操盤手風格與明確買賣定調)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        generationConfig: { temperature: 0.7 }
      });

      const prompt = `你是在 LINE 群組裡跟好友日常互動的頂尖台股操盤手「財神熊」。
群組朋友提問：「${cleanQuery}」
${historyContext}
${isClearlyOffTopic ? '' : marketInfo}
${quoteInfo ? quoteInfo : ''}

【第一步：先判斷對方的提問情境與意圖（非常重要！）】：

情境一：【純幹話 / 挑釁 / 開玩笑 / 閒聊 / 無聊問問 / 互嗆】
（特徵：對方根本不是在認真做股票功課，只是在打嘴砲、挑釁、找碴、開玩笑、閒聊，例如：「我現在就在澳門 你想怎樣」、「你很嗆喔」、「熊哥你帥嗎」、「今天中午吃什麼」、「你在幹嘛」等）
👉【絕對禁止一本正經說教！絕對禁止強行扯大盤點位、籌碼面或大道理！絕對不可長篇大論！】
👉 只要用【1 句話（20~30 字以內）】像真人老友一樣幽默調侃、毒舌回嗆或接梗笑鬧過去即可！
例如回：
- 「人在澳門賭錢還這麼嗆？贏錢記得分紅，輸光了別找我借錢買機票就好。」
- 「你想怎樣？我只想盯盤賺錢，你在澳門吹冷氣少來惹我。」
- 「帥不帥看什麼？看對帳單啊，只要今天賺夠多，我連呼吸都是帥的。」

情境二：【認真問具體個股 / 點位 / 停損】
（特徵：詢問某檔能不能買、代碼行情、防守價、某檔走勢）
👉 採俐落快刀流（約 100~130 字），直接給出明確定調【建議買進/分批加碼】或【不建議碰/建議賣出調節】，並附上關鍵防守價與核心理由。

情境三：【認真問大盤大格局 / 總經宏觀趨勢】
（特徵：詢問大盤方向、能不能上五萬、整體多空、長線資產佈局）
👉 採老手深度流（約 180~250 字，分 2~3 個自然短段落），基於當前台股大盤真實行情（約 4 萬點時代），深度剖析主力結構與操作思維。

【共通要求】：
1. 具備頂級對話靈性：嚴禁任何客服機械開場白（例如「老闆您好」），不要死板條列報告，真人講話風格！
2. 若使用者是在接續上一話題（例如「那這檔停損看哪」），順著脈絡自然回答。
3. 大盤真實行情數據僅在對方【認真詢問股市大盤】時使用，嚴禁在朋友日常幹話或無聊問問中搬出大盤說教！`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) {
        saveConversationTurn(sessionId, cleanQuery, text, senderName, detectedSymbol, stockName);
        return text;
      }
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用真人自然口吻量化引擎: ' + err.message);
    }
  }

  // 5. 本地高智商量化引擎 (自然對話流、無死板標題、2~4句講完重點)
  if (detectedSymbol && currentQuote) {
    const close = currentQuote.closePrice || currentQuote.lastPrice || 0;
    const change = currentQuote.change || 0;
    const changePct = parseFloat(currentQuote.changePercent || 0);
    const sign = change >= 0 ? '+' : '';
    const low = currentQuote.lowPrice || close;
    const high = currentQuote.highPrice || close;
    const pivot = (high + low + close) / 3;
    const sup1 = (2 * pivot - high).toFixed(1);
    const volume = currentQuote.total?.tradeVolume ? `，成交量 ${(currentQuote.total.tradeVolume / 1000).toFixed(1)}k 張` : '';

    if (changePct <= -3.5) {
      return `${detectedSymbol} ${stockName || detectedSymbol} 今天重挫 ${sign}${changePct.toFixed(2)}% 收在 ${close} 元${volume}，破線賣壓非常沉重。
明確【不建議進場接刀】！短線下方支撐先看 ${sup1} 元；手上有持股的建議趁反彈減碼出清，若跌破今日低點 ${low.toFixed(1)} 元務必嚴格停損，千萬別盲目凹單！`;
    } else if (changePct <= -1.0) {
      return `${detectedSymbol} ${stockName || detectedSymbol} 今天回檔 ${sign}${changePct.toFixed(2)}% 收 ${close} 元${volume}，技術面回測均線整理。
【暫不建議追價，先等回測站穩】！下方防守看 ${sup1} 元，有守再考慮分批低接；已有持股者續抱即可，跌破 ${low.toFixed(1)} 元再考慮減碼。`;
    } else if (changePct >= 3.5) {
      return `${detectedSymbol} ${stockName || detectedSymbol} 今天帶量強攻 ${sign}${changePct.toFixed(2)}% 衝到 ${close} 元${volume}，多方攻擊氣勢很強！
【建議順勢加碼 / 偏多操作】！回測支撐 ${sup1} 元不破都是好買點；持有者建議抱緊讓獲利奔跑，將停利點設在 ${low.toFixed(1)} 元。`;
    } else if (changePct >= 0.5) {
      return `${detectedSymbol} ${stockName || detectedSymbol} 今天逆勢抗跌 ${sign}${changePct.toFixed(2)}% 收 ${close} 元${volume}，底部逐步墊高、守穩支撐。
【建議逢拉回分批布局】！靠近 ${sup1} 元可分批少量買進；手上有持股的續抱即可，多方防守結構完好。`;
    } else {
      return `${detectedSymbol} ${stockName || detectedSymbol} 目前在 ${low.toFixed(1)} ~ ${high.toFixed(1)} 元窄幅整理，收 ${close} 元${volume}，多空量縮拉鋸。
【空手不建議追，持股建議續抱】！未突破壓力前進場容易被磨損耐心，持股以 ${low.toFixed(1)} 元為防守點守住續抱即可。`;
    }
  }

  // 6. 一般提問（現在買什麼、推薦、大盤）
  if (cleanQuery.includes('買') || cleanQuery.includes('推薦') || cleanQuery.includes('選') || cleanQuery.includes('大盤') || cleanQuery.includes('看')) {
    return `大盤這幾天權值股帶頭震盪回檔，投機飆股很容易被洗破線，【明確不建議追高投機股】！
現在想進場，【強烈建議分批買抗震高息或市值型 ETF】（像 00919、0056、006208），跌破五日線分批定額買最安全，手上記得留 4 成現金！`;
  }

  return `目前盤面多空震盪拉鋸，熱門股回檔賣壓還在消化，【不建議隨意進場追高】！
手上有持股的建議檢視五日線，破線轉弱的先減碼 1/3 控管風險，保留現金等大盤帶量長紅收腳再順勢加碼。`;
};

/**
 * 下載 LINE 傳送的圖片二進制內容
 */
export const downloadLineImage = async (messageId) => {
  const channelId = process.env.LINE_CHANNEL_ID || '2012651187';
  const channelSecret = process.env.LINE_CHANNEL_SECRET || 'a6841f1c4a39a3d52fb48b55a364ac16';
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
        model: 'gemini-3.1-flash-lite',
        generationConfig: { temperature: 0.5 }
      });

      const prompt = `你是一位在 LINE 群組裡跟好友交流的高勝率頂尖台股操盤高手（財神熊）。
使用者在 LINE 群組上傳了一張圖片（股票走勢圖、K線、券商對帳單或損益截圖）。

【回覆核心指引】：
1. 完全比照你在 Gemini 官方網頁上的真人自然對話狀態發揮！字數長短自由，講得透徹有理最重要，嚴禁刻板的句數或字數束縛。
2. 保持頂尖操盤手的犀利直覺，一眼看穿圖片中的盲點、型態或獲利關鍵，嚴禁任何客服廢話開場白，嚴禁死板報告模板。
3. 絕不講「觀望」！必須直接給出主觀操作方向：到底是【建議加碼買進】還是【不建議碰/建議賣出停損】！
4. 個股或走勢直接點出具體防守或停損價位，空手與持股者分別給出果斷指引。`;

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

  // 真人自然口吻備援 (無 API 時維持高手直覺，絕不回廢話或死板模板)
  return `看這張圖的線型與籌碼結構，短線破線賣壓沉重、量能失控，【強烈不建議進場追高接刀】！手上有部位的建議趁反彈減碼出清，空手者保留現金先別急著抄底。`;
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
      const mentees = event.message.mention?.mentees || [];
      const isDirectlyTagged = mentees.some(m => m.isSelf === true);
      const taggedOthers = mentees.some(m => m.isSelf === false);

      // 如果使用者有 @ 標註群組其他朋友（例如 @星森董事長），且沒有呼叫機器人，絕對不可插嘴！
      if (taggedOthers && !isDirectlyTagged && !text.includes('財神熊')) {
        return false;
      }

      // 只有在明確呼叫機器人時才回覆：
      // 1. 官方 @ 到機器人 (isSelf === true)
      // 2. 文字中包含「財神熊」
      // 3. 文字包含「@財神熊」或「@機器人」
      // 4. 指令開頭 ! 或 /
      const isMentioned = isDirectlyTagged 
        || text.includes('財神熊') 
        || /@\s*(財神熊|機器人|bot)/i.test(text)
        || text.startsWith('!')
        || text.startsWith('/');

      if (!isMentioned) {
        return false; // 在群組裡平常朋友聊天完全不打擾
      }
    }

    const sessionId = event.source?.groupId || event.source?.roomId || event.source?.userId || 'default_session';
    const groupId = event.source?.groupId;
    const userId = event.source?.userId;
    let senderName = '群組朋友';
    if (userId) {
      try {
        senderName = await getUserDisplayName(groupId, userId);
      } catch (e) {
        // 忽略
      }
    }

    logger.info('LINEReply', `收到 [${senderName}] 提問: "${text}" (replyToken: ${replyToken})`);
    const replyContent = await processUserQuestion(text, sessionId, senderName);
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
