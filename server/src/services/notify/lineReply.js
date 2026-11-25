import axios from 'axios';
import YahooFinance from 'yahoo-finance2';
import { logger } from '../../utils/logger.js';
import { getQuote } from '../fugle/marketData.js';
import { fetchTopHeadlines } from '../news/cnyesNews.js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 常用熱門美股代碼與名稱對照表
const US_STOCK_MAP = {
  // 科技巨頭與熱門標的
  '輝達': { symbol: 'NVDA', name: '輝達 (NVIDIA)' },
  'nvda': { symbol: 'NVDA', name: '輝達 (NVIDIA)' },
  'nvidia': { symbol: 'NVDA', name: '輝達 (NVIDIA)' },
  '特斯拉': { symbol: 'TSLA', name: '特斯拉 (Tesla)' },
  'tsla': { symbol: 'TSLA', name: '特斯拉 (Tesla)' },
  'tesla': { symbol: 'TSLA', name: '特斯拉 (Tesla)' },
  '蘋果': { symbol: 'AAPL', name: '蘋果 (Apple)' },
  'aapl': { symbol: 'AAPL', name: '蘋果 (Apple)' },
  'apple': { symbol: 'AAPL', name: '蘋果 (Apple)' },
  '微軟': { symbol: 'MSFT', name: '微軟 (Microsoft)' },
  'msft': { symbol: 'MSFT', name: '微軟 (Microsoft)' },
  '超微': { symbol: 'AMD', name: '超微 (AMD)' },
  'amd': { symbol: 'AMD', name: '超微 (AMD)' },
  '台積電adr': { symbol: 'TSM', name: '台積電 ADR' },
  'tsm': { symbol: 'TSM', name: '台積電 ADR' },
  'tsmc adr': { symbol: 'TSM', name: '台積電 ADR' },
  '聯電adr': { symbol: 'UMC', name: '聯電 ADR' },
  'umc': { symbol: 'UMC', name: '聯電 ADR' },
  '鴻海adr': { symbol: 'HNHPF', name: '鴻海 ADR' },
  '谷歌': { symbol: 'GOOGL', name: 'Alphabet / Google' },
  'google': { symbol: 'GOOGL', name: 'Alphabet / Google' },
  'googl': { symbol: 'GOOGL', name: 'Alphabet / Google' },
  '亞馬遜': { symbol: 'AMZN', name: '亞馬遜 (Amazon)' },
  'amzn': { symbol: 'AMZN', name: '亞馬遜 (Amazon)' },
  'amazon': { symbol: 'AMZN', name: '亞馬遜 (Amazon)' },
  'meta': { symbol: 'META', name: 'Meta' },
  '臉書': { symbol: 'META', name: 'Meta' },
  '博通': { symbol: 'AVGO', name: '博通 (Broadcom)' },
  'avgo': { symbol: 'AVGO', name: '博通 (Broadcom)' },
  '美光': { symbol: 'MU', name: '美光 (Micron)' },
  'mu': { symbol: 'MU', name: '美光 (Micron)' },
  '高通': { symbol: 'QCOM', name: '高通 (Qualcomm)' },
  'qcom': { symbol: 'QCOM', name: '高通 (Qualcomm)' },
  '英特爾': { symbol: 'INTC', name: '英特爾 (Intel)' },
  'intel': { symbol: 'INTC', name: '英特爾 (Intel)' },
  'smci': { symbol: 'SMCI', name: '美超微 (Supermicro)' },
  '美超微': { symbol: 'SMCI', name: '美超微 (Supermicro)' },
  'pltr': { symbol: 'PLTR', name: 'Palantir' },
  'palantir': { symbol: 'PLTR', name: 'Palantir' },

  // 指數與主要 ETF
  '納斯達克': { symbol: '^IXIC', name: '納斯達克綜合指數' },
  '那斯達克': { symbol: '^IXIC', name: '那斯達克綜合指數' },
  '納指': { symbol: '^IXIC', name: '納斯達克綜合指數' },
  '那指': { symbol: '^IXIC', name: '那斯達克綜合指數' },
  'qqq': { symbol: 'QQQ', name: 'Invesco QQQ 納指 ETF' },
  '費城半導體': { symbol: '^SOX', name: '費城半導體指數' },
  '費半': { symbol: '^SOX', name: '費城半導體指數' },
  'sox': { symbol: '^SOX', name: '費城半導體指數' },
  'soxx': { symbol: 'SOXX', name: 'iShares 半導體 ETF' },
  '標普500': { symbol: '^GSPC', name: '標普 500 指數' },
  '標普': { symbol: '^GSPC', name: '標普 500 指數' },
  's&p500': { symbol: '^GSPC', name: '標普 500 指數' },
  's&p': { symbol: '^GSPC', name: '標普 500 指數' },
  'spy': { symbol: 'SPY', name: 'SPDR 標普 500 ETF' },
  'voo': { symbol: 'VOO', name: 'Vanguard 標普 500 ETF' },
  '道瓊': { symbol: '^DJI', name: '道瓊工業指數' },
  '道瓊指數': { symbol: '^DJI', name: '道瓊工業指數' }
};

export const resolveUSStock = (query) => {
  if (!query) return null;
  const q = query.toLowerCase();
  for (const [key, val] of Object.entries(US_STOCK_MAP)) {
    if (q.includes(key)) {
      return val;
    }
  }
  return null;
};

export const isUSMarketQuery = (query) => {
  if (!query) return false;
  if (resolveUSStock(query)) return true;
  return /(美股|美指|夜盤|美東|美盤|美債|美聯儲|聯準會|降息幾碼|鮑爾)/i.test(query);
};

export const isCrossMarketQuery = (query) => {
  if (!query) return false;
  const hasUS = /(美股|美指|納指|那指|費半|標普|道瓊|輝達|美債)/i.test(query);
  const hasTW = /(台股|大盤|加權|台積電|外資|明天開盤|開盤會不會)/i.test(query);
  const hasRelation = /(影響|帶動|連動|拖累|波及|牽動|怎麼看明天|明天會怎樣)/i.test(query);
  return (hasUS && hasTW) || (hasUS && hasRelation);
};

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

// 群組與個人對話上下文記憶池 (滑動視窗保留最近 4 則訊息 / 2 回合，10 分鐘有效，嚴防陳年話題污染)
const chatHistoryMap = new Map();
const MAX_HISTORY = 4;
const HISTORY_EXPIRE_MS = 10 * 60 * 1000;

/**
 * 判斷當前提問是否明確在追問上一話題的個股（只有明確代名詞或針對標的操作的動作，才繼承個股代碼）
 */
export const isExplicitStockFollowUp = (query) => {
  if (!query) return false;
  const q = query.trim();
  // 1. 明確包含代名詞：它、這檔、這支、這隻、這家、這檔股票、那它、那這檔、那這家
  const pronounRegex = /^(它|這[檔支隻]|那[這檔支隻]|這家|這檔股票|那它|那這[檔支隻]|那這家)/;
  // 2. 針對上一檔股票明確問後續操作動作（如：那停損看哪、那能追嗎、它現在、能加碼嗎、成本多少、要賣嗎、續抱嗎）
  const followUpActionRegex = /(那它|那這[檔支隻]|它現在|這檔現在|停損[看設]|目標[價點]|還能[追買加]|能追嗎|能買嗎|能進嗎|要賣嗎|要跑嗎|該跑嗎|該賣嗎|能抱嗎|續抱|成本多少|被套|套牢)/;
  return pronounRegex.test(q) || followUpActionRegex.test(q);
};

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
 * 專屬尊稱處理（當發問者是和順時，回覆一律以「和順老闆」開頭，且絕對嚴禁洩漏「星森」字眼）
 */
export const applyHonorific = (text, senderName = '') => {
  if (!text) return text;

  // ⚠️【核心保密防護】：徹底過濾「星森」任何字眼，群組一律只能叫「和順老闆」，絕不可洩漏「星森」！
  text = text.replace(/星森[董董事長]*/g, '和順老闆');
  text = text.replace(/星森/g, '和順');

  if (/和順|星森/i.test(senderName)) {
    if (!text.startsWith('和順老闆')) {
      text = text.replace(/^(和順[，,！!~～\s]*|星森[董董事長]*[，,！!~～\s]*)/, '');
      return `和順老闆，${text.trim()}`;
    }
  }
  return text;
};

/**
 * 分析群組使用者對機器人的提問，並產出高情商、大白話的解答 (支援連續對話話題記憶)
 */
export const processUserQuestion = async (userText, sessionId = 'default', senderName = '群組朋友') => {
  const reply = await _processUserQuestionRaw(userText, sessionId, senderName);
  return applyHonorific(reply, senderName);
};

const _processUserQuestionRaw = async (userText, sessionId = 'default', senderName = '群組朋友') => {
  // 將可能帶有星森的發問者名稱直接正規化為「和順老闆」，徹底絕跡私下備註
  let cleanSenderName = senderName;
  if (/和順|星森/i.test(cleanSenderName)) {
    cleanSenderName = '和順老闆';
  }

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
    historyContext = `\n【最近群組對話話題脈絡】（僅供理解上下文；若使用者提問轉換話題，請以當前最新問題為主）：\n${historyLines}\n`;

    // 找出上一話題中討論的股票（備用參考）
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      if (recentHistory[i].stockSymbol) {
        lastMentionedStock = { symbol: recentHistory[i].stockSymbol, name: recentHistory[i].stockName };
        break;
      }
    }
  }

  // 3. 自動識別個股代碼或標的（美股與台股雙引擎）
  const isUS = isUSMarketQuery(cleanQuery);
  const isCross = isCrossMarketQuery(cleanQuery);
  const resolvedUS = resolveUSStock(cleanQuery);

  let detectedSymbol = null;
  let stockName = '';
  let isUSStock = false;
  let isInheritedStock = false;
  let resolved = null;

  if (resolvedUS) {
    detectedSymbol = resolvedUS.symbol;
    stockName = resolvedUS.name;
    isUSStock = true;
  } else if (!isUS) {
    resolved = await resolveStock(cleanQuery);
    if (resolved) {
      detectedSymbol = resolved.symbol;
      stockName = resolved.name;
    }
  }

  // ⚠️【核心防護】：只有當問題未提及個股，且明確使用代名詞或追問操作（如「它停損看哪」、「那能追嗎」）時，才繼承上一檔股票！
  if (!detectedSymbol && lastMentionedStock && isExplicitStockFollowUp(cleanQuery)) {
    detectedSymbol = lastMentionedStock.symbol;
    stockName = lastMentionedStock.name;
    isInheritedStock = true;
    isUSStock = /^[A-Z\^]{1,6}$/.test(detectedSymbol) && !/^\d{4,6}$/.test(detectedSymbol);
  }

  // 取得即時行情數據（美股用 Yahoo Finance，台股用 Fugle）
  let quoteInfo = '';
  let currentQuote = null;

  if (detectedSymbol) {
    if (isUSStock || resolvedUS) {
      try {
        const uq = await yahooFinance.quote(detectedSymbol);
        if (uq) {
          const price = uq.regularMarketPrice || 0;
          const change = parseFloat(uq.regularMarketChange || 0);
          const changePct = parseFloat(uq.regularMarketChangePercent || 0);
          const sign = change >= 0 ? '+' : '';
          const unit = detectedSymbol.startsWith('^') ? '點' : '美元';
          quoteInfo = `\n【${detectedSymbol} ${stockName} 美股即時行情】：現報 ${price} ${unit} (${sign}${change.toFixed(2)} / ${sign}${changePct.toFixed(2)}%)，今日區間 ${uq.regularMarketDayLow || price} ~ ${uq.regularMarketDayHigh || price}`;
        }
      } catch (e) {
        logger.warn('LINEReply', `查詢美股報價 ${detectedSymbol} 失敗: ` + e.message);
      }
    } else if (detectedSymbol !== 'IX0001') {
      try {
        currentQuote = await getQuote(detectedSymbol);
        if (currentQuote) {
          const price = currentQuote.closePrice || currentQuote.lastPrice || 0;
          const change = parseFloat(currentQuote.change || 0);
          const changePct = parseFloat(currentQuote.changePercent || 0);
          const sign = change >= 0 ? '+' : '';
          const name = stockName || currentQuote.name || detectedSymbol;
          quoteInfo = `\n【${detectedSymbol} ${name} 台股即時行情】：成交價 NT$ ${price} (${sign}${change} / ${sign}${changePct}%)`;
        }
      } catch (e) {
        logger.warn('LINEReply', `查詢台股報價 ${detectedSymbol} 失敗: ` + e.message);
      }
    }
  }

  // 取得大盤數據（美股提問抓那斯達克，台股提問抓加權指數，跨市場提問抓兩者；絕對不把台股大盤強塞給美股提問！）
  let marketInfo = '';
  if (isUS && !isCross) {
    // 專屬美股大盤行情（那斯達克）
    try {
      const nasdaqQuote = await yahooFinance.quote('^IXIC');
      if (nasdaqQuote) {
        const nPrice = nasdaqQuote.regularMarketPrice || 0;
        const nChangePct = parseFloat(nasdaqQuote.regularMarketChangePercent || 0).toFixed(2);
        const nSign = parseFloat(nChangePct) >= 0 ? '+' : '';
        marketInfo = `\n【當前美股那斯達克即時行情】：現報 ${nPrice} 點 (${nSign}${nChangePct}%)。`;
      }
    } catch (e) {}
  } else if (!isUS) {
    // 純台股提問：台股加權指數
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
    } catch (e) {}
  } else {
    // 跨市場提問（問美股對台股的連動與影響）
    try {
      const [marketQuote, nasdaqQuote] = await Promise.all([
        getQuote('IX0001').catch(() => null),
        yahooFinance.quote('^IXIC').catch(() => null)
      ]);
      const parts = [];
      if (marketQuote) {
        const mPrice = marketQuote.closePrice || marketQuote.lastPrice || 0;
        const mChangePct = parseFloat(marketQuote.changePercent || 0);
        const mSign = mChangePct >= 0 ? '+' : '';
        parts.push(`台股加權指數現報 ${mPrice} 點 (${mSign}${mChangePct}%)`);
      }
      if (nasdaqQuote) {
        const nPrice = nasdaqQuote.regularMarketPrice || 0;
        const nChangePct = parseFloat(nasdaqQuote.regularMarketChangePercent || 0).toFixed(2);
        const nSign = parseFloat(nChangePct) >= 0 ? '+' : '';
        parts.push(`美股那斯達克現報 ${nPrice} 點 (${nSign}${nChangePct}%)`);
      }
      if (parts.length > 0) {
        marketInfo = `\n【美股與台股跨市場即時行情】：${parts.join('，')}。`;
      }
    } catch (e) {}
  }

  // 取得當前市場即時重大焦點新聞（掌握川普關稅、國際黑天鵝、政經大事件）
  let newsContext = '';
  try {
    const headlines = await fetchTopHeadlines(10);
    if (headlines && headlines.length > 0) {
      const newsLines = headlines.map(h => `- ${h.title}`).join('\n');
      newsContext = `\n【當前市場即時重大焦點新聞（非常關鍵：若市場大漲大跌，請由此找出真正元兇與催化劑，絕不講空話）】：\n${newsLines}\n`;
    }
  } catch (e) {
    // 忽略新聞獲取失敗
  }

  // 4. AI 智慧分析生成回答（完全廢除人工死規則，由 Gemini 幾千億參數大腦自行理解語意與意圖！）
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const candidateModels = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.1-flash-lite'
      ];

      const isHeshun = /和順|星森/i.test(senderName) || /和順/.test(cleanQuery);

      const honorificDirective = isHeshun ? `
【發問者專屬稱呼（最高核心保密規則）】：
發問朋友是【和順老闆】：
👉 開頭第一句一律稱呼「和順老闆，」，維持敬重專業、客觀穩健、如好友操盤手一般的交流。
⚠️【最高禁令】：全世界只有稱呼他「和順老闆」！絕對嚴禁出現「星森」、「星森董事長」任何字眼（這是在個人手機上的私下備註，如果講出來會穿幫被罵！絕對嚴禁講「星森」）！` : '';

      const prompt = `你是 LINE 投資群組裡跟朋友兄弟日常互動的資深操盤手大哥「財神熊」。
【雙料核心實力】：你是一位在台灣股市與美股市場征戰二十年的雙料頂尖操盤手，【台股、美股雙修，兩邊都極度精通實戰】！群裡朋友台股和美股「都要操作」！
群組朋友【${cleanSenderName}】發問：「${cleanQuery}」
${historyContext}
${newsContext}
${marketInfo}
${quoteInfo}
${honorificDirective}

【角色設定與語氣原則】：
你是一位在台股與美股市場打滾二十年的實戰老操盤手大哥。
講話風格：真實自然（道地台灣繁體中文口語）、一針見血、靈活應對、乾脆俐落、絕不官腔、絕不死板！
就像群裡身經百戰、懂盤又懂聊天的真正朋友，絕不能讓人感覺是個死板的機器人！

🎯【回覆指令（精確回答使用者的問題核心）】：

1. 🔥【分析大漲大跌、市場重挫或走勢原因（絕對拒絕罐頭廢話）】：
   - 👉 參考【當前市場即時重大焦點新聞】：若當天市場有突發核彈級政經事件（如川普揮動關稅大刀、美債殖利率暴衝、外資大砍單、黑天鵝等），【必須一針見血直接點出真正的元兇】！
   - ⚠️【絕對禁令】：絕不要敷衍說「短線獲利回吐」、「正常震盪洗盤」等不知所謂的官腔教科書廢話！市場暴跌 2000~3000 點絕對是有重大黑天鵝或政策核彈，老操盤手必須直接點破真實利空是什麼！

2. 🇺🇸【問美股（如美股走勢、納斯達克/納指、標普、費半、輝達 NVDA、特斯拉 TSLA、蘋果、微軟、美股夜盤等）】：
   - 👉【100% 聚焦美股自身】：
     直接針對該美股指數或個股（如輝達、納指）在美東市場的走勢、技術型態、美元支撐壓力、買盤動能、財報或總經利率影響做專業精闢的操盤手分析！
   - 👉 ⚠️【絕對禁令：問美股絕不主動扯台股】：
     問美股就只聊美股！【絕對嚴禁莫名其妙硬扯台股】（嚴禁講「雖然台股大漲三千點」、「明天台股開盤會怎樣」）！除非使用者明確提問「美股對台股的影響」，否則絕對禁止主動提台股！人家問美股，你硬扯台股只會顯得答非所問、文不對題！

3. 🇹🇼【問台股（如台股大盤、加權指數、台股個股 2330、0050、櫃買等）】：
   - 👉 聚焦台股加權指數、成交量能、外資投信籌碼與台股技術點位分析。

4. 🌐【問美股與台股跨市場連動（如「美股大跌會不會拖累台股」、「美股今晚會帶動明天台股嗎」）】：
   - 👉 此時才深度分析美股科技巨頭（輝達、台積電 ADR）與台股電子權值股的連動關係！

5. 【問二選一、多選一、或程度提問（如「大漲還是小漲」、「加碼還是減碼」、「買A還是買B」、「買哪檔好」）】：
   - 👉【必須正面選擇其一】：直接回答使用者的選項！例如問「會大漲還是小漲」，必須直接回答「偏小漲震盪！」或「有機會再大漲！」，【絕對禁止答非所問只丟一個看漲】！
   - 👉【接著 1~2 句解釋理由】：針對你的選擇給出理由。

6. 【問盤勢多空或特定個股能不能追/買/賣】：
   - 第一句直接給出果斷明確的判斷（如「輝達短線偏多續強！」、「納指偏震盪整理！」、「看漲！」、「建議先觀望！」），禁止打太極（不說看量才知、這很難說）。
   - 接著給出核心支撐價位（美股給美元價位，台股給台幣價位）！

7. 【面對誇張數字或豪氣喊盤（如「今天會漲四千點嗎」、「年底五萬」）】：
   - 自然輕鬆接梗，幽默中帶出老手的客觀視角，像朋友聊盤一樣自然，不要千篇一律罵人「在做夢」或「喝多了」。

8. 【純朋友日常閒聊或互嗆（如問午餐、天氣、或開玩笑）】：
   - 簡短回覆 1~2 句（20~30 字以內），展現老朋友般的默契與幽默，不硬扯股市。

❌【絕對禁止的機器人行為與死板套路】：
1. 嚴禁跳針與複製上一則的句子：
   - 連續對話中，【絕對嚴禁重複上一則回覆用過的句子、口號或結尾】！每一則回覆都必須是全新的用詞！
2. 嚴禁公文公告式標題（不打「【看漲】！」、「【看跌】！」）。
3. 嚴禁重複模板與人身嘲諷（絕對嚴禁講「你看盤看到眼花了吧」、「眼睛脫窗」、「你是在做夢還是喝多了」、「老哥剛才不是回過你嗎」、「穩紮穩打卡實在」）！態度成熟大方、客觀專業。
4. 嚴禁刻意做作的假流氓黑話（不講「林北」、「你這咖」等刻意字眼）。
5. 回覆字數適中（約 40 ~ 90 字），段落分明、自然流暢，像真人 LINE 快速打字！`;

      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ];

      let text = '';
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.65 },
            safetySettings
          });
          const res = await model.generateContent(prompt);
          text = res.response.text().trim();
          if (text) break;
        } catch (modelErr) {
          logger.warn('LINEReply', `模型 ${modelName} 呼叫異常: ` + modelErr.message);
        }
      }

      if (text) {
        // 只有當前問題確實有識別到個股（美股或台股），或是明確繼承追問時，才儲存股票標的；非個股提問絕不儲存股票標的！
        const stockToSave = (resolvedUS?.symbol || resolved?.symbol || isInheritedStock) ? detectedSymbol : null;
        const nameToSave = (resolvedUS?.name || resolved?.name || isInheritedStock) ? stockName : null;
        saveConversationTurn(sessionId, cleanQuery, text, senderName, stockToSave, nameToSave);
        return text;
      }
    } catch (err) {
      logger.warn('LINEReply', 'Gemini 呼叫流程異常: ' + err.message);
    }
  }

  // 5. 本地高智商量化引擎 (僅在有真實有效報價且股價大於 0 時兜底，嚴防無效股票或 0 元報價產生笑話)
  if (detectedSymbol && currentQuote) {
    const close = currentQuote.closePrice || currentQuote.lastPrice || 0;
    if (close > 0) {
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
  }

  // 6. 生活瑣事 / 閒聊本地兜底
  if (/百家|賭|賭場|百家樂/i.test(cleanQuery)) {
    return '百家樂致富的永遠只有開賭場的老闆！進去都是給人送錢，想賺錢還是腳踏實地看盤做趨勢比較實在。';
  }

  // 7. 明確的股市提問本地兜底（買什麼、推薦、大盤、消化時程）
  if (cleanQuery.includes('消化') || cleanQuery.includes('長') || cleanQuery.includes('區間') || cleanQuery.includes('時間') || cleanQuery.includes('何時')) {
    return `目前盤面處於回檔洗浮額階段，依照籌碼沉澱規律，這波賣壓消化通常需要 5 到 8 個交易日（約 1~2 週）。
關鍵觀察兩個訊號：第一是成交量必須量縮至波段窒息量；第二是站回 5 日線且出現帶量長紅確認落底。在訊號確認前先保持耐心、防守為上！`;
  }

  if (cleanQuery.includes('買') || cleanQuery.includes('推薦') || cleanQuery.includes('選') || cleanQuery.includes('大盤') || cleanQuery.includes('看盤') || cleanQuery.includes('指數')) {
    return `大盤這幾天權值股帶頭震盪，熱門飆股容易被洗盤，【明確不建議隨意追高】！
想進場建議分批買抗震高息或市值型 ETF（如 00919、0056、006208），跌破五日線分批定額買最安全，手上務必保留現金！`;
  }

  // 8. 非股票詢問的通用真人兜底（絕不再死板輸出股票定型文！）
  return '剛剛網路訊號閃了一下沒聽清，兄弟你剛說啥？再說一次看看！';
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
      const candidateModels = [
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest'
      ];

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

      let text = '';
      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { temperature: 0.7 }
          });
          const res = await model.generateContent([prompt, imagePart]);
          text = res.response.text().trim();
          if (text) break;
        } catch (modelErr) {
          logger.warn('LINEReply', `圖片分析模型 ${modelName} 呼叫異常: ` + modelErr.message);
        }
      }

      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini 圖片分析異常: ' + err.message);
    }
  }

  return `哎呀這張圖讀取有點卡，兄弟你再傳一次我幫你看！`;
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

      // 如果使用者有 @ 標註群組其他朋友（例如 @小明），且沒有呼叫機器人，絕對不可插嘴！
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
    if (/和順|星森/i.test(senderName)) {
      senderName = '和順老闆';
    }

    // 紀錄該群組最近一次 @財神熊 的時間與文字 (供先 @ 後傳圖片使用)
    recentGroupMentions.set(sessionId, { timestamp: Date.now(), text });

    // 檢查群組過去 60 秒內是否剛好有上傳過圖片，且文字意圖包含看圖？
    // (例如使用者先傳了一張照片，緊接著 @財神熊 看這張 / 幫看這張 / @財神熊)
    const cleanForImage = text.replace(/@\s*[\w\u4e00-\u9fa5]+/g, '').trim();
    const cachedImage = recentGroupImages.get(sessionId);
    const hasRecentImage = cachedImage && (Date.now() - cachedImage.timestamp < 60000);
    const isImageIntent = /圖|照|截圖|看這|幫看|看下|分析這|這張|這檔|這支/i.test(cleanForImage) || cleanForImage === '' || cleanForImage === '看';

    if (hasRecentImage && isImageIntent) {
      // 成功匹配：使用者傳了圖並 @財神熊 看圖！
      recentGroupImages.delete(sessionId);
      recentGroupMentions.delete(sessionId);

      logger.info('LINEReply', `收到 [${senderName}] @財神熊 看圖: "${text}"`);
      const replyContent = await processUserImage(cachedImage.imageBuffer, text);
      const ok = await replyLineMessage(replyToken, applyHonorific(replyContent, senderName));
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
        const ok = await replyLineMessage(replyToken, applyHonorific(replyContent, senderName));
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
