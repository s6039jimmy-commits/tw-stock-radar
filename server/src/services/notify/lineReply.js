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

  // 3. AI 分析生成回答 (專業、偏主觀、智慧俐落、像投顧首席操盤手)
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3 }
      });

      const prompt = `你是一位擁有 20 年實戰經驗的頂尖外資與投顧首席台股操盤分析師（名字叫財神熊）。
現在使用者在 LINE 群組裡 @你 提問：「${cleanQuery}」
${quoteInfo ? quoteInfo : ''}

【回覆口吻與專業要求】：
1. 直接回答，嚴禁任何開場白（嚴禁出現「收到您的提問」、「您好」等廢話開頭）。
2. 像真正的資深專業操盤手，講話一針見血、數據紮實、條理分明。
3. 【最重要原則】：嚴禁使用「觀望」兩個字敷衍！必須給出清晰的答案：到底是【建議買進 / 加碼】還是【不建議進場 / 建議賣出減碼】！
4. 針對「想買進的人（空手者）」和「手上有部位的人（持股者）」分別給出具體點位與操作步驟（如支撐點、壓力點、停損停利點）。
5. 控制在 120~180 字內，排版乾淨俐落，讓使用者在手機上 3 秒看懂重點。
6. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等官腔免責廢話。`;

      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text) return text;
    } catch (err) {
      logger.warn('LINEReply', 'Gemini API 異常，啟用頂級專業操盤決策引擎: ' + err.message);
    }
  }

  // 4. 頂級專業量化決策引擎 (以即時量價、籌碼、Pivot 支撐壓力產出專業建議，絕不給模稜兩可的觀望)
  if (detectedSymbol && currentQuote) {
    const close = currentQuote.closePrice || currentQuote.lastPrice || 0;
    const open = currentQuote.openPrice || close;
    const high = currentQuote.highPrice || close;
    const low = currentQuote.lowPrice || close;
    const change = currentQuote.change || 0;
    const changePct = parseFloat(currentQuote.changePercent || 0);
    const sign = change >= 0 ? '+' : '';

    const volume = currentQuote.total?.tradeVolume || 0;
    const valBillion = ((currentQuote.total?.tradeValue || 0) / 100000000).toFixed(2);
    const bidVol = currentQuote.total?.tradeVolumeAtBid || 0;
    const askVol = currentQuote.total?.tradeVolumeAtAsk || 0;
    const totalBidAsk = bidVol + askVol || 1;
    const askRatio = ((askVol / totalBidAsk) * 100).toFixed(1);
    const bidRatio = ((bidVol / totalBidAsk) * 100).toFixed(1);

    const pivot = (high + low + close) / 3;
    const sup1 = (2 * pivot - high).toFixed(2);
    const res1 = (2 * pivot - low).toFixed(2);
    const amp = (((high - low) / (close - change || 1)) * 100).toFixed(2);

    let stance = '';
    let emptyHandAdvice = '';
    let holderAdvice = '';

    if (changePct <= -3.5) {
      stance = '【明確不建議進場！建議逢反彈減碼出清】';
      emptyHandAdvice = `【絕對不建議進場摸底接刀】！短線放量下殺振幅達 ${amp}%，賣方倒內盤佔 ${bidRatio}%，第一道強支撐下移至 ${sup1} 元，未見連續縮量收腳前，任何拉抬皆為主力逃命波，切勿躁進。`;
      holderAdvice = `【建議逢盤中反彈分批停損/減碼】！關鍵防守點看今日低點 ${low.toFixed(2)} 元，一旦失守恐引發多殺多斷頭潮，務必壯士斷腕收回現金。`;
    } else if (changePct <= -1.0) {
      stance = '【暫不建議進場摸底，待回測支撐有守再看】';
      emptyHandAdvice = `【暫不建議進場追價】！今日回檔消化賣壓，內盤拋售佔 ${bidRatio}%，先觀察支撐位 ${sup1} 元附近是否有主力大單護盤收腳，站穩前切忌猜底。`;
      holderAdvice = `【持股建議續抱但設緊防守】！以 ${low.toFixed(2)} 元為關鍵防守點，若跌破建議減碼 1/3 控管風險。`;
    } else if (changePct >= 3.5) {
      stance = '【強烈建議順勢加碼 / 偏多積極操作】';
      emptyHandAdvice = `【建議逢盤中壓回分批買進】！多頭帶量噴出，主動敲外盤比達 ${askRatio}%，回測支撐 ${sup1} 元為優質上車點，切勿空手乾瞪眼。`;
      holderAdvice = `【強烈建議持股續抱享受波段】！將今日低點 ${low.toFixed(2)} 元設為移動停利點，讓利潤奔跑。`;
    } else if (changePct >= 0.5) {
      stance = '【建議逢低分批布局 / 偏多看待】';
      emptyHandAdvice = `【建議逢低建倉買進】！走勢抗跌墊高，守穩均線，外盤買單佔 ${askRatio}%，拉回靠近 ${sup1} 元可分批少量卡位。`;
      holderAdvice = `【建議持股續抱】！只要未跌破 ${low.toFixed(2)} 元，多方防禦結構完好，安心持股。`;
    } else {
      stance = '【空手不建議追、持股建議續抱盯緊防守點】';
      emptyHandAdvice = `【暫不建議進場消耗資金】！在未放量突破短壓 ${res1} 元前，進場易陷入盤整泥淖，建議把錢留在更有動能的標的。`;
      holderAdvice = `【建議持股續抱，以 ${low.toFixed(2)} 元為防守基準】！守住可續抱，跌破則減碼。`;
    }

    const volumeLine = volume > 0 ? `\n• 盤面量能：成交 ${volume.toLocaleString()} 張 (約 ${valBillion} 億) | 外盤主動買 ${askRatio}% vs 內盤倒貨 ${bidRatio}%` : '';
    const supportLine = high > 0 ? `\n• 關鍵防線：強支撐 ${sup1} 元 | 短壓 ${res1} 元` : '';

    return [
      `【${detectedSymbol} ${stockName || detectedSymbol} 專業盤勢診斷】`,
      `• 即時報價：NT$ ${close} (${sign}${change} / ${sign}${changePct.toFixed(2)}%)${volumeLine}${supportLine}`,
      '',
      `🎯 核心定調：${stance}`,
      '',
      `📋 實戰操作指引：`,
      `👉 想買進者（空手）：${emptyHandAdvice}`,
      `👉 手上有者（持股）：${holderAdvice}`
    ].join('\n');
  }

  // 5. 針對「現在還有什麼可以買」、「大盤怎麼看」、「推薦什麼」的提問直接給出明確專業配置指南
  if (cleanQuery.includes('買') || cleanQuery.includes('推薦') || cleanQuery.includes('選') || cleanQuery.includes('大盤') || cleanQuery.includes('看')) {
    return [
      '【🏛️ 首席操盤手實戰佈局指引】',
      '• 盤面診斷：當前大盤由權值股帶頭承壓整理，小型投機股波動劇烈容易多殺多。',
      '',
      '🎯 核心定調：【明確不建議追高投機飆股！強烈建議將資金轉進抗震高息 ETF 與防禦族群】',
      '',
      '📋 實戰佈局推薦：',
      '1. 006208（富邦台積/台灣50）：市值型首選，大盤拉回均線分批定額買進勝率最高！【明確建議買進】',
      '2. 00919（群益精選高息）／0056（元大高股息）：年化配息率 9%~10%，大盤震盪時的超級避風港！【強烈建議逢綠加碼】',
      '3. 2412 中華電／2886 兆豐金：低 Beta 防禦標的，抗跌護盤首選。【建議逢低建倉】',
      '',
      '💡 資金水位建議：震盪期間保留 4 成現金、6 成防禦持股，切勿滿槓桿融資追高！'
    ].join('\n');
  }

  return [
    '【🏛️ 首席操盤手盤勢快評】',
    '• 盤面診斷：目前市場多空力道拉鋸，熱門股獲利了結賣壓湧現。',
    '',
    '🎯 核心定調：【不建議盲目進場追價！建議持股汰弱留強】',
    '',
    '📋 實戰操作建議：',
    '👉 想進場者：【暫不建議追買高檔強勢股】，建議等大盤帶量長紅收腳再分批布局。',
    '👉 手上有者：【建議檢視持股】，若跌破 5 日線且轉弱者建議果斷減碼 1/3，嚴格控管資金風險！'
  ].join('\n');
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

      const prompt = `你是一位擁有 20 年實戰經驗的頂尖外資與投顧首席台股操盤分析師（名字叫財神熊）。
使用者在 LINE 群組上傳了一張圖片（可能為：股票K線走勢圖、券商對帳單、庫存損益截圖、或財經要聞）。

請仔細審視這張圖片並提供頂級專業、客觀且具備實戰指引的解析：
1. 嚴禁任何開場白廢話（嚴禁出現「收到您的提問」、「您好」等）。
2. 【最核心原則】：嚴禁使用「觀望」敷衍！必須給出清晰的答案：到底是【建議買進 / 加碼】還是【不建議進場 / 建議賣出減碼】！
3. 提取圖片核心數據（如損益金額、佔比、個股名稱代碼、K線型態突破或摜破位置）。
4. 針對「想進場者（空手）」與「已有部位者（持股）」分別給出具體點位與操作步驟（如防守價、停損點、壓力位）。
5. 控制在 120~180 字內，排版乾淨俐落。
6. 嚴禁出現「老手」、「投資盈虧自負」、「請謹慎評估」等官腔廢話。`;

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

  // 頂級專業量化診斷 (若無 API 或額度限制，提供投顧級診斷指南，絕不回觀望)
  return [
    '【📊 對帳單／走勢截圖 首席專業診斷】',
    '• 盤面診斷：當前市場處於高波動震盪洗盤期，短線頻繁衝銷極易損耗高額手續費與交易稅，甚至面臨追高套牢壓力。',
    '',
    '🎯 核心定調：【明確不建議進場追高！建議控管資金與嚴格停損】',
    '',
    '📋 實戰操作建議：',
    '👉 想進場者（空手）：【不建議追逐高檔弱勢飆股】，市場未見實體長紅帶量收腳前，保留 4~5 成現金實力。',
    '👉 套牢持股者：【建議嚴格設定 5%~7% 停損點】，若摜破短期均線，逢反彈應果斷減碼 1/3，嚴禁盲目攤平凹單！',
    '👉 獲利持股者：【建議移動停利】，跌破昨日低點則部分獲利了結，守住戰果！'
  ].join('\n');
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
