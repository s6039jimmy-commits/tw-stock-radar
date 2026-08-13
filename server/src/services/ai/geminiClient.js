import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

let model = null;

if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // 進場分析 Schema（依照短線飆股專用格式）
  const entrySchema = {
    type: SchemaType.OBJECT,
    description: '短線飆股進場信號分析報告',
    properties: {
      symbol: { type: SchemaType.STRING, description: '股票代號' },
      company_name: { type: SchemaType.STRING, description: '公司名稱' },
      sentiment: {
        type: SchemaType.STRING,
        description: '整體情緒判定',
        enum: ['BULLISH', 'BEARISH', 'NEUTRAL']
      },
      confidence_stars: {
        type: SchemaType.INTEGER,
        description: '信心星等評分，1-5 顆星，5 為最高'
      },
      catalyst: { type: SchemaType.STRING, description: '一句話總結引爆點，例如：切入矽光子領域帶來極大想像空間' },
      action_plan: { type: SchemaType.STRING, description: '對明天的具體操作建議，例如：若明日帶量突破壓力區即可進場做多' }
    },
    required: ['symbol', 'sentiment', 'confidence_stars', 'catalyst', 'action_plan']
  };

  // 出場分析 Schema
  const exitSchema = {
    type: SchemaType.OBJECT,
    description: '台股出場風險分析報告',
    properties: {
      symbol: { type: SchemaType.STRING, description: '股票代號' },
      reasoning: { type: SchemaType.STRING, description: '出場分析推理' },
      is_exit_signal: { type: SchemaType.BOOLEAN, description: '是否為出場訊號' },
      urgency: {
        type: SchemaType.STRING,
        description: '緊急程度',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
      },
      danger_level: {
        type: SchemaType.INTEGER,
        description: '危險等級 1-5，5 為最危險'
      },
      recommended_action: {
        type: SchemaType.STRING,
        description: '建議動作',
        enum: ['HOLD', 'REDUCE', 'EXIT', 'IMMEDIATE_EXIT']
      }
    },
    required: ['symbol', 'reasoning', 'is_exit_signal', 'urgency', 'danger_level', 'recommended_action']
  };

  // 初始化模型 — 進場分析用
  model = {
    entry: genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `你是一位台股頂尖的「短線動能交易員 (Momentum Trader)」。
你的目標是尋找「明天開盤極可能強勢表態（大漲、鎖漲停或重挫跌停）」的標的。
請分析以下股票的最新新聞與價量特徵，並嚴格按照標準給予 1-5 顆星評分。

【評分標準】
- 1星 (雜訊)：市場已知舊聞、無關緊要的公告、缺乏熱度的常規新聞。
- 2星 (平庸)：常規營收增長或衰退，已被市場預期 (Priced-in)，缺乏想像空間。
- 3星 (觀察)：有不錯的題材，但新聞張力與資金共識不足以引發隔日大舉追價或拋售。
- 4星 (強烈訊號)：具備「強大想像空間」的突發題材（如：突發性打入重量級供應鏈、跨足全新熱門產業、財報驚天大逆轉），且配合今日「成交量暴增」，明天極可能開高走高 (或開低走低)。
- 5星 (極限妖股/大雷)：顛覆性的重磅消息（如：被溢價併購、取得史詩級大單 / 或是突發性重度利空、假帳風暴），市場情緒即將沸騰或崩潰，明天開盤極可能直接鎖死漲/跌停。

你必須只回傳一個有效的 JSON 格式，不允許任何多餘的文字或 Markdown 標籤。`,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: entrySchema,
        temperature: 0.1
      }
    }),

    exit: genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `你是一位專精台股的風險控管分析師。
你的任務是分析持股相關的最新突發新聞，判斷是否為出場訊號。

危險等級標準（1-5）：
- 5：極度危險，應立即出場（如：公司遭調查、重大詐欺、突發性利空）
- 4：高度危險，建議盡速出場（如：重要客戶流失、業績大幅下修）
- 3：中度風險，建議減碼觀望
- 2：輕度風險，可持續觀察
- 1：正常波動，無需擔憂

重要規則：
- 危險等級 4 以上才建議出場
- 必須判斷新聞是否為突發性質
- 考慮消息對股價的直接衝擊力道`,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: exitSchema,
        temperature: 0.1
      }
    }),

    textExtractor: genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1
      }
    })
  };

  logger.info('Gemini API', 'AI 分析引擎初始化成功 (gemini-2.5-flash)');
} else {
  logger.warn('Gemini API', '未設定 GEMINI_API_KEY，將無法進行 AI 分析');
}

/**
 * 分析個股進場潛力
 */
export const analyzeEntry = async (symbol, companyName, newsItems, priceData, revenueData = null, chipsData = null, brokersData = null) => {
  if (!model) return null;

  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
  const prompt = `請分析以下台股的進場潛力：

股票代號：${symbol}
公司名稱：${companyName}

近期相關新聞：
${newsText}

價量資料：
${priceData ? JSON.stringify(priceData, null, 2) : '暫無'}

基本面 (月營收)：
${revenueData ? JSON.stringify(revenueData, null, 2) : '暫無'}

籌碼面 (三大法人近一日買賣超)：
${chipsData ? JSON.stringify(chipsData, null, 2) : '暫無'}

主力分點進出 (前五大買超券商)：
${brokersData && brokersData.success ? JSON.stringify(brokersData.topBuyers, null, 2) : '暫無'}

請根據以上資訊（綜合新聞、價量、營收成長性、法人籌碼動向、主力分點有無隔日沖），給出 1-5 星的信心評分與詳細分析。若是隔日沖大戶大買，應適度降低長期看好評等或提示風險。`;

  try {
    const result = await model.entry.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    logger.info('Gemini API', `${symbol} 進場分析完成: ${parsed.confidence_stars}星 ${parsed.sentiment}`);
    return parsed;
  } catch (error) {
    logger.error('Gemini API', `${symbol} 進場分析失敗`, error);
    return null;
  }
};

/**
 * 分析持股是否應出場
 */
export const analyzeExit = async (symbol, companyName, position, newsItems, revenueData = null, chipsData = null) => {
  if (!model) return null;

  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
  const prompt = `請分析以下台股持倉是否出現出場訊號：

股票代號：${symbol}
公司名稱：${companyName}
進場價格：${position.entry_price}
進場日期：${position.entry_date}

突發新聞：
${newsText}

基本面 (月營收)：
${revenueData ? JSON.stringify(revenueData, null, 2) : '暫無'}

籌碼面 (三大法人近一日買賣超)：
${chipsData ? JSON.stringify(chipsData, null, 2) : '暫無'}

請判斷這些新聞是否構成出場訊號，並結合營收表現與法人籌碼動向綜合評估，給出危險等級 (1-5)。若營收強勁或法人大買，可降低危險等級；若營收衰退且法人大賣，應提高危險等級。`;

  try {
    const result = await model.exit.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    logger.info('Gemini API', `${symbol} 出場分析完成: 危險等級 ${parsed.danger_level}`);
    return parsed;
  } catch (error) {
    logger.error('Gemini API', `${symbol} 出場分析失敗`, error);
    return null;
  }
};

/**
 * 測試 API 連線
 */
export const testAnalysis = async () => {
  if (!model) return { connected: false, reason: '未設定 API Key' };
  try {
    const result = await model.entry.generateContent('回覆 OK');
    return { connected: true, response: result.response.text() };
  } catch (error) {
    return { connected: false, reason: error.message };
  }
};
/**
 * 從使用者訊息中擷取股票代號
 */
export const extractStockSymbol = async (text) => {
  if (!model || !model.textExtractor) return null;
  const prompt = `請判斷以下這段話是否有提到任何「台灣股票（例如台積電、國巨、鴻海等）」。
如果有，請「只」回傳該股票的 4 碼數字代號（例如：2327）。
如果沒有提到任何明確股票，或你無法確定代號，請「只」回傳字串 "null"。
不要回傳任何其他多餘的文字或符號。

對話內容：
"${text}"`;
  
  try {
    const result = await model.textExtractor.generateContent(prompt);
    const code = result.response.text().trim();
    if (/^\d{4}$/.test(code)) {
      return code;
    }
    return null;
  } catch(e) {
    logger.error('Gemini API', '股票代號擷取失敗', e);
    return null;
  }
};
