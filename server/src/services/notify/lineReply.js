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

// 群組最新上傳圖片快取 (sessionId -> { imageBuffer, timestamp })
const recentGroupImages = new Map();
// 群組最近 @財神熊 標註記錄 (sessionId -> { timestamp, text })
const recentGroupMentions = new Map();

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

  // 3. 自動識別個股代碼或標的（輔助獲取最新行情提供給 AI 參考，不作任何硬性限制攔截）
  const resolved = await resolveStock(cleanQuery);
  let detectedSymbol = resolved?.symbol || null;
  let stockName = resolved?.name || '';

  // 若當前提問沒指定個股，但上一話題有討論個股，輔助帶入上一標的作為備用參考
  if (!detectedSymbol && lastMentionedStock) {
    detectedSymbol = lastMentionedStock.symbol;
    stockName = lastMentionedStock.name;
  }

  // 取得即時個股行情數據（若有識別到個股）
  let quoteInfo = '';
  let currentQuote = null;
  if (detectedSymbol && detectedSymbol !== 'IX0001') {
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

  // 取得大盤數據（常駐提供給 AI 作為大環境點位背景）
  let marketInfo = '';
  let mPrice = 0;
  try {
    const marketQuote = await getQuote('IX0001');
    if (marketQuote) {
      mPrice = marketQuote.closePrice || marketQuote.lastPrice || 0;
      const mChange = parseFloat(marketQuote.change || 0);
      const mChangePct = parseFloat(marketQuote.changePercent || 0);
      const mSign = mChange >= 0 ? '+' : '';
      const mHigh = marketQuote.highPrice || mPrice;
      marketInfo = `\n【當前台股大盤真實行情】：加權指數現報 ${mPrice} 點 (${mSign}${mChange} / ${mSign}${mChangePct}%)，今日高點 ${mHigh} 點。`;
    }
  } catch (e) {
    // 忽略大盤獲取失敗
  }

  // 4. AI 智慧分析生成回答（完全廢除人工死規則，由 Gemini 幾千億參數大腦自行理解語意與意圖！）
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        generationConfig: { temperature: 0.5 }
      });

      const prompt = `你是 LINE 群組裡跟好友日常互動的「財神熊」（資深台股老操盤手）。
群組朋友提問：「${cleanQuery}」
${historyContext}
${marketInfo}
${quoteInfo}

【角色人設與最高行為守則】：
你是一位在台灣股市打滾多年、實戰經驗豐富的資深老操盤手「財神熊」。
你講話像一位真人在 LINE 群組裡跟兄弟打字的老手：乾脆俐落、接地氣、有話直說，但面對朋友認真請教投資行情時【態度極度專業、認真、給出實質見解】！

【請由你自行判斷朋友提問的語意，精準分流回覆】：

情境 A【只要帶有任何股市、投資、行情、漲跌、技術分析、買賣、時程相關語意】
（不論文字多簡短、不論是否有錯別字、即使使用隱喻俚語，例如：「開始長」、「要蹲多久」、「車開了嗎」、「被主力甩轎」、「還能追嗎」、「會破底嗎」、「何時消化完」、「套牢怎麼辦」）：
👉 一律判定為認真的行情討論，給予專業、精闢且客觀的判斷（約 60~120 字）！
👉 若問走勢多空：直接給出多空方向定調、關鍵支撐防守價與 1 句核心理由。
👉 若問時間或時程（如「何時消化完」、「大概多久」）：老手都知道沒有絕對，但資深操盤手會依據「技術面時間波（通常需 5~8 個交易日 / 1~2 週的時間打底消化）」與「轉折確認訊號（1. 成交量萎縮至低點窒息量；2. 帶量長紅重回 5 日線）」給出具體且負責任的技術區間與觀察重點！
👉 ❌【最高禁令】：
  1. 嚴禁任何冷嘲熱諷、酸言酸語、消極擺爛推託！
     嚴禁說出任何類似「去問神明」、「神仙才知道」、「去夏威夷喝香檳」、「我不算命」、「算命師」、「少問廢話」、「自己去算」等諷刺甩鍋言論！
  2. 嚴禁分條列點寫出生硬的「明日多空定調：」、「盤面現況：」、「操作建議：」等公文標題！直接用真人老操盤手的自然語氣打字回覆。

情境 B【只有在 100% 完全無關股市投資的純生活瑣事】
（例如：純問「午餐吃什麼」、「今天天氣好嗎」、「有人靠百家致富的麼」、「百家樂賭博好玩嗎」、「講個笑話」、「早安」）：
👉 這不是問股票！用幽默自然的老朋友口氣回 1~2 句（約 20~40 字以內）。
👉 ❌【最高禁令】：絕對嚴禁提及大盤、加權指數、成交量或任何股市點位數據！話題只針對朋友問的生活話題幽默回覆，回答完俐落結束，絕不多扯半句股市！

【共通規範】：
1. 嚴禁任何客服機械開場白（如「老闆您好」、「投資有風險」等廢話）。
2. 自然對話、真人打字，不套死板公版！`;

      let text = '';
      try {
        const res = await model.generateContent(prompt);
        text = res.response.text().trim();
      } catch (geminiError) {
        try {
          const modelFallback = genAI.getGenerativeModel({
            model: 'gemini-3.8-flash',
            generationConfig: { temperature: 0.5 }
          });
          const resFallback = await modelFallback.generateContent(prompt);
          text = resFallback.response.text().trim();
        } catch (fbErr) {
          logger.warn('LINEReply', 'Gemini API 異常，啟用真人自然口吻量化引擎: ' + geminiError.message);
        }
      }

      if (text) {
        saveConversationTurn(sessionId, cleanQuery, text, senderName, detectedSymbol, stockName);
        return text;
      }
    } catch (err) {
      logger.warn('LINEReply', 'Gemini 呼叫流程異常: ' + err.message);
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

  // 6. 生活瑣事 / 閒聊本地兜底
  if (isCasual) {
    if (/百家|賭|賭場|百家樂/i.test(cleanQuery)) {
      return '百家樂致富的永遠只有開賭場的老闆！進去都是給人送錢，想賺錢還是腳踏實地看盤做趨勢比較實在。';
    }
    return '哈哈，少跟我打嘴砲，專心賺錢或好好放鬆啦！';
  }

  // 7. 一般提問（現在買什麼、推薦、大盤、消化時程）
  if (cleanQuery.includes('消化') || cleanQuery.includes('長') || cleanQuery.includes('區間') || cleanQuery.includes('時間') || cleanQuery.includes('何時')) {
    return `目前盤面處於回檔洗浮額階段，依照籌碼沉澱規律，這波賣壓消化通常需要 5 到 8 個交易日（約 1~2 週）。
關鍵觀察兩個訊號：第一是成交量必須量縮至波段窒息量；第二是站回 5 日線且出現帶量長紅確認落底。在訊號確認前先保持耐心、防守為上！`;
  }

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
 * 圖片多模態 AI 分析 (K線圖、對帳單、庫存損益截圖，以及生活照日常嘴砲)
 */
export const processUserImage = async (imageBuffer, userQuery = '') => {
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        generationConfig: { temperature: 0.7 }
      });

      const prompt = `你是在 LINE 群組裡跟好友日常互動的頂尖台股操盤手「財神熊」。
群組朋友傳了一張圖片，並叫你看圖${userQuery ? `，他說：「${userQuery}」` : ''}。

【情境一：若圖片是【日常生活照片】（如玩具公仔、食物美食、風景出遊、自拍、日常物品、生活瑣事等，非股票）】：
👉【絕對禁止長篇大論！絕對禁止一本正經把日常物品當成股票說教分析！】
👉 請用 1~2 句話（約 20~40 字以內），像真人老朋友一樣日常嘴砲、幽默吐槽或開玩笑回覆即可！
例如：
- 看到熊抱哥/公仔：「叫我看熊抱哥幹嘛？抱這隻能幫你持股解套逆？趕快收心回去盯盤啦！」
- 看到美食：「傳這個誘惑我是想怎樣？賺錢了不請客，還故意拍照拉仇恨是吧？」
- 看到風景出遊：「在外面爽爽玩還叫我看盤？贏錢記得分紅，輸了別找我借機票錢就好。」

【情境二：若圖片是【股市相關圖表】（股票K線、走勢圖、券商對帳單、損益截圖）】：
👉 採俐落快刀流（長度約 100~130 字），一眼看穿型態盲點，直接給出果斷定調【建議偏多/加碼】或【不建議碰/建議賣出調節】，並附上關鍵防守價位。
👉 嚴禁長篇大論、客服開場白或死板報告模板。`;

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

  return `看你這張圖，我只想說：別分心搞這些有的沒的，趕快收心回去盯盤啦！`;
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
  const sessionId = event.source?.groupId || event.source?.roomId || event.source?.userId || 'default_session';
  const groupId = event.source?.groupId;
  const userId = event.source?.userId;

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
      const isMentioned = isDirectlyTagged 
        || text.includes('財神熊') 
        || /@\s*(財神熊|機器人|bot)/i.test(text)
        || text.startsWith('!')
        || text.startsWith('/');

      if (!isMentioned) {
        return false; // 在群組裡平常朋友聊天完全不打擾
      }
    }

    let senderName = '群組朋友';
    if (userId) {
      try {
        senderName = await getUserDisplayName(groupId, userId);
      } catch (e) {
        // 忽略
      }
    }

    // 紀錄該群組最近一次 @財神熊 的時間與文字 (供先 @ 後傳圖片使用)
    recentGroupMentions.set(sessionId, { timestamp: Date.now(), text });

    // 檢查群組過去 3 分鐘內是否剛好有上傳過圖片？
    // (例如使用者先傳了一張照片，緊接著 @財神熊 看這張 / @財神熊)
    const cachedImage = recentGroupImages.get(sessionId);
    const hasRecentImage = cachedImage && (Date.now() - cachedImage.timestamp < 180000);

    if (hasRecentImage) {
      // 成功匹配：使用者傳了圖並 @財神熊 看圖！
      recentGroupImages.delete(sessionId);
      recentGroupMentions.delete(sessionId);

      logger.info('LINEReply', `收到 [${senderName}] @財神熊 看圖: "${text}"`);
      const replyContent = await processUserImage(cachedImage.imageBuffer, text);
      const ok = await replyLineMessage(replyToken, replyContent);
      logger.info('LINEReply', `看圖回覆結果: ${ok ? '成功' : '失敗'}`);
      return ok;
    }

    // 正常的純文字提問流程
    logger.info('LINEReply', `收到 [${senderName}] 提問: "${text}" (replyToken: ${replyToken})`);
    const replyContent = await processUserQuestion(text, sessionId, senderName);
    const ok = await replyLineMessage(replyToken, replyContent);
    logger.info('LINEReply', `回覆結果: ${ok ? '成功' : '失敗'}`);
    return ok;
  }

  // 2. 處理圖片訊息
  if (msgType === 'image') {
    try {
      const imageBuffer = await downloadLineImage(event.message.id);
      if (!imageBuffer) return false;

      // 快取該群組圖片（保存 3 分鐘，等待使用者 @財神熊 指示看圖）
      recentGroupImages.set(sessionId, { imageBuffer, timestamp: Date.now() });

      // 檢查使用者是否在 60 秒前才剛 @財神熊（例如先打字「@財神熊 幫看這張」，接著立刻丟出圖片）
      const lastMention = recentGroupMentions.get(sessionId);
      const isMentionPending = lastMention && (Date.now() - lastMention.timestamp < 60000);

      // 如果是在 1 對 1 私聊，或是群組裡使用者剛剛才 @過財神熊：
      if (!isGroup || isMentionPending) {
        const userPrompt = isMentionPending ? lastMention.text : '';
        recentGroupImages.delete(sessionId);
        recentGroupMentions.delete(sessionId);

        logger.info('LINEReply', `📸 收到圖片且匹配到 @財神熊，開始進行 AI 分析與回覆...`);
        const replyContent = await processUserImage(imageBuffer, userPrompt);
        const ok = await replyLineMessage(replyToken, replyContent);
        logger.info('LINEReply', `圖片回覆結果: ${ok ? '成功' : '失敗'}`);
        return ok;
      }

      // 如果在群組內，且【沒有 @財神熊】：
      // 絕對不主動插話！只默默暫存圖片，靜候使用者 @財神熊 才是請它看！
      logger.info('LINEReply', '📸 群組收到日常圖片，未 @財神熊，保持靜音並快取等待 @ 指示。');
      return false;
    } catch (err) {
      logger.error('LINEReply', '處理圖片失敗: ' + err.message);
      return false;
    }
  }

  return false;
};
