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

  // 3. AI 分析生成回答 (無死板攔截，讓 AI 自由發揮，但堅守操盤手風格與明確買賣定調)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3.1-flash-lite',
        generationConfig: { temperature: 0.7 }
      });

      const prompt = `你是一個在 LINE 群組裡講話俐落、極度聰明的高勝率台股操盤高手（財神熊）。
群組朋友提問：「${cleanQuery}」
${quoteInfo ? quoteInfo : ''}

【回覆風格要求】：
1. 像真人高手在群組打字一樣自然流暢、自由發揮，嚴禁任何開場白（不要「您好」、「收到提問」），也嚴禁死板的報告格式（不要「【🏛️ 盤勢快評】」、「🎯 核心定調」、「👉 想買者」這種笨重模板！）。
2. 控制在 2~4 句話內（80~120 字），言簡意賅，直接切中要害。
3. 絕不講「觀望」這種廢話！必須明確給出答案：到底是【建議買進/加碼】還是【不建議碰/建議賣出停損】！
4. 若問個股，直接點出關鍵支撐或停損價位，空手與持股者一句話帶過。
5. 若問「all in / 歐印 / 借錢」等極端躁進操作，用操盤手犀利直白、毒舌中肯的方式打醒或指引，明確給出結論！`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
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

      const prompt = `你是一個在 LINE 群組裡講話俐落、極度聰明的高勝率台股操盤高手（財神熊）。
使用者在 LINE 群組上傳了一張圖片（股票走勢圖、K線、券商對帳單或損益截圖）。

【回覆風格要求】：
1. 像真人操盤高手在群組打字一樣隨性自然、乾淨俐落，嚴禁任何開場白（不要「您好」、「收到提問」），也嚴禁死板的報告模板（嚴禁「【📊 對帳單／走勢截圖】」、「🎯 核心定調」、「👉 想進場者」這種格式！）。
2. 控制在 2~4 句話內（80~120 字），一眼看穿圖片盲點或獲利關鍵，直接點評。
3. 絕不講「觀望」！必須直接給出明確答案：到底是【建議加碼/買進】還是【不建議碰/建議賣出停損】！
4. 個股或走勢直接給出具體防守或停損價位，空手與持股者一句話帶過。`;

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
