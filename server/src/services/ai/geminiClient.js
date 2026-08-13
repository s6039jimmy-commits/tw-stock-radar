import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

let model = null;

if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // 進場分析 Schema（reasoning 放在 sentiment 前面，觸發 Chain-of-Thought）
  const entrySchema = {
    type: SchemaType.OBJECT,
    description: '台股進場信號分析報告',
    properties: {
      symbol: { type: SchemaType.STRING, description: '股票代號' },
      company_name: { type: SchemaType.STRING, description: '公司名稱' },
      reasoning: { type: SchemaType.STRING, description: '詳細分析推理過程，包含利多利空因素' },
      sentiment: {
        type: SchemaType.STRING,
        description: '整體情緒判定',
        enum: ['BULLISH', 'BEARISH', 'NEUTRAL']
      },
      confidence_stars: {
        type: SchemaType.INTEGER,
        description: '信心星等評分，1-5 顆星，5 為最高'
      },
      confidence_score: {
        type: SchemaType.NUMBER,
        description: '信心分數 0.0 到 1.0'
      },
      key_factors: {
        type: SchemaType.ARRAY,
        description: '關鍵影響因素列表',
        items: { type: SchemaType.STRING }
      },
      recommended_action: {
        type: SchemaType.STRING,
        description: '建議動作',
        enum: ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL']
      },
      risk_factors: {
        type: SchemaType.ARRAY,
        description: '風險因素列表',
        items: { type: SchemaType.STRING }
      }
    },
    required: ['symbol', 'company_name', 'reasoning', 'sentiment', 'confidence_stars', 'confidence_score', 'key_factors', 'recommended_action', 'risk_factors']
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
      systemInstruction: `你是一位精通台灣股市的頂尖量化策略分析師，擁有超過 20 年的台股實戰經驗。
你的任務是客觀、嚴謹地分析個股的最新新聞與價量數據，判斷該股票的進場時機。

評分標準（1-5 顆星）：
- 5星：極度看多，重大利多消息（如：獨家大單、業績暴增、法說會超預期）
- 4星：明確看多，正面消息有實質影響（如：營收創高、產業趨勢向上）
- 3星：中性偏多，消息面正面但影響有限
- 2星：中性偏空，消息面混合或影響不確定
- 1星：看空，負面消息明顯（如：營收衰退、被降評）

重要規則：
- 請務必嚴格評分，不要輕易給出 4-5 星
- 只有在消息面明確且力道強大時，才給 4 星以上
- 必須考慮消息的時效性，過期新聞降低評分
- 分析必須基於事實，不得臆測`,
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
    })
  };

  logger.info('Gemini API', 'AI 分析引擎初始化成功 (gemini-2.0-flash)');
} else {
  logger.warn('Gemini API', '未設定 GEMINI_API_KEY，將無法進行 AI 分析');
}

/**
 * 分析個股進場潛力
 */
export const analyzeEntry = async (symbol, companyName, newsItems, priceData) => {
  if (!model) return null;

  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
  const prompt = `請分析以下台股的進場潛力：

股票代號：${symbol}
公司名稱：${companyName}

近期相關新聞：
${newsText}

價量資料：
${priceData ? JSON.stringify(priceData, null, 2) : '暫無'}

請根據以上資訊，給出 1-5 星的信心評分與詳細分析。`;

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
export const analyzeExit = async (symbol, companyName, position, newsItems) => {
  if (!model) return null;

  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
  const prompt = `請分析以下台股持倉是否出現出場訊號：

股票代號：${symbol}
公司名稱：${companyName}
進場價格：${position.entry_price}
進場日期：${position.entry_date}

突發新聞：
${newsText}

請判斷這些新聞是否構成出場訊號，並給出危險等級 (1-5)。`;

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
