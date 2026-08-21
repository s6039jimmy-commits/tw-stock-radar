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
      systemInstruction: `你是個說話超直白、不講廢話的台股風控老手。
你的任務是分析持股的突發新聞，判斷這檔股票是不是要崩了。

危險等級標準（1-5）：
- 5：極度危險（出大事了，例如被調查、作假帳，這會直接跌停，快逃！）
- 4：高度危險（實質大暴雷，例如掉單、財報爛，主力要倒貨了，快閃！）
- 3：中度風險（風向不對，主力可能在偷出貨）
- 2：輕度風險（就是些雜訊，不用自己嚇自己）
- 1：正常波動（根本沒事）

⚠️ 語氣與文字要求：
1. 【絕對禁止使用財經術語】！全部翻譯成連菜市場阿嬤都聽得懂的白話文。
2. 語氣要極度直接、帶點江湖味！
3. 【絕對不要打官腔】！絕對禁止出現「建議觀望」、「待籌碼穩定後再評估」這類廢話！要砍就直接叫人砍，沒事就說沒事！`,
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
 * ============================================================
 * 量化評分引擎 — 硬規則決定星數，AI 只寫分析文字
 * ============================================================
 * 通用評分：
 *  爆量 ≥ 5x          +35 分（超級爆量）
 *  爆量 ≥ 3x          +25 分
 *  爆量 ≥ 2x          +15 分
 *  外資買超            +20 分
 *  投信買超            +15 分
 *  外資+投信同步買超   +10 分（額外加乘）
 *  月營收年增率 ≥ 20%  +20 分
 *  月營收年增率 ≥ 10%  +10 分
 *  月營收月增率 ≥ 10%  +5  分
 *  今日漲幅 ≥ 9%       +25 分（接近漲停）
 *  今日漲幅 ≥ 5%       +15 分
 *  今日漲幅 ≥ 3%       +8  分
 *  非隔日沖主力        +5  分
 *  隔日沖主力大買      -25 分（重大扣分）
 *
 * 中小型飆股專屬評分：
 *  散戶爆量 ≥ 5x 且市值小  +20 分
 *  股價創 20 日新高         +15 分
 *  今日跳空開高 ≥ 2%        +15 分
 *  有重大公告觸發           +10 分
 *  股價在布林上軌突破        +10 分（以 highPrice > openPrice * 1.05 估算）
 *
 *  ≥70 → 5星，≥50 → 4星，≥30 → 3星，≥15 → 2星，<15 → 1星
 */
export const quantitativeScore = (priceData, chipsData, revenueData, brokersData, extraData = {}) => {
  let score = 0;
  const breakdown = [];

  // 1. 爆量評分（強化超級爆量加分）
  const volumeRatio = parseFloat(priceData?.volumeRatio || priceData?.volume_ratio || 0);
  if (volumeRatio >= 5) {
    score += 35; breakdown.push(`超級爆量 ${volumeRatio.toFixed(1)}x (+35)`);
  } else if (volumeRatio >= 3) {
    score += 25; breakdown.push(`爆量 ${volumeRatio.toFixed(1)}x (+25)`);
  } else if (volumeRatio >= 2) {
    score += 15; breakdown.push(`量增 ${volumeRatio.toFixed(1)}x (+15)`);
  }

  // 2. 法人籌碼評分
  if (chipsData) {
    const foreignNet = chipsData.foreign || 0;
    const trustNet = chipsData.trust || 0;
    if (foreignNet > 0) {
      score += 20; breakdown.push(`外資買超 ${Math.round(foreignNet / 1000)}張 (+20)`);
    }
    if (trustNet > 0) {
      score += 15; breakdown.push(`投信買超 ${Math.round(trustNet / 1000)}張 (+15)`);
    }
    if (foreignNet > 0 && trustNet > 0) {
      score += 10; breakdown.push(`外資+投信同步買超 (+10)`);
    }
  }

  // 3. 月營收評分
  if (revenueData) {
    const yoy = parseFloat(revenueData.yoy || revenueData.yearOverYearGrowth || 0);
    const mom = parseFloat(revenueData.mom || revenueData.monthOverMonthGrowth || 0);
    if (yoy >= 20) {
      score += 20; breakdown.push(`月營收年增 +${yoy.toFixed(1)}% (+20)`);
    } else if (yoy >= 10) {
      score += 10; breakdown.push(`月營收年增 +${yoy.toFixed(1)}% (+10)`);
    }
    if (mom >= 10) {
      score += 5; breakdown.push(`月營收月增 +${mom.toFixed(1)}% (+5)`);
    }
  }

  // 4. 當日漲幅評分（強化接近漲停的加分）
  const changeP = parseFloat(priceData?.changePercent || priceData?.change_percent || 0);
  if (changeP >= 9) {
    score += 25; breakdown.push(`接近漲停 +${changeP.toFixed(1)}% (+25)`);
  } else if (changeP >= 5) {
    score += 15; breakdown.push(`今日強漲 +${changeP.toFixed(1)}% (+15)`);
  } else if (changeP >= 3) {
    score += 8; breakdown.push(`今日漲幅 +${changeP.toFixed(1)}% (+8)`);
  }

  // 5. 主力分點評分（隔日沖扣分）
  if (brokersData && brokersData.success) {
    if (brokersData.isDayTradeRisk) {
      score -= 25; breakdown.push(`⚠️ 隔日沖主力大買 (-25)`);
    } else if (brokersData.topBuyers && brokersData.topBuyers.length > 0) {
      score += 5; breakdown.push(`主力分點持續買進 (+5)`);
    }
  }

  // ============================================================
  // 6. 【中小型飆股專屬評分】
  // ============================================================

  // 6a. 散戶爆量（中小型股 + 成交量暴衝，通常代表散戶瘋搶）
  const price = parseFloat(priceData?.lastPrice || priceData?.closePrice || 0);
  if (volumeRatio >= 5 && price < 200) {
    score += 20; breakdown.push(`🔥 散戶爆量（小型股量比${volumeRatio.toFixed(1)}x）(+20)`);
  }

  // 6b. 股價創 20 日新高（突破壓力區，常見飆股起漲點）
  const highPrice = parseFloat(priceData?.highPrice || 0);
  const high20d = parseFloat(priceData?.high20d || 0); // 需要scanner傳入
  if (high20d > 0 && highPrice >= high20d) {
    score += 15; breakdown.push(`🚀 突破 20 日高點 ${high20d} (+15)`);
  }

  // 6c. 跳空開高（開盤就比昨收高出 2% 以上，代表大量追買）
  const openPrice = parseFloat(priceData?.openPrice || 0);
  const prevClose = parseFloat(priceData?.previousClose || priceData?.prevClose || 0);
  if (openPrice > 0 && prevClose > 0) {
    const gapPct = (openPrice - prevClose) / prevClose * 100;
    if (gapPct >= 3) {
      score += 15; breakdown.push(`⬆️ 跳空開高 +${gapPct.toFixed(1)}% (+15)`);
    } else if (gapPct >= 2) {
      score += 10; breakdown.push(`⬆️ 跳空開高 +${gapPct.toFixed(1)}% (+10)`);
    }
  }

  // 6d. 有重大公告觸發（TWSE 公告）
  if (extraData.hasAnnouncement) {
    score += 10; breakdown.push(`📢 今日有重大公告 (+10)`);
  }

  // 星數轉換 (依使用者要求，5星維持70，4星微調至55避免太多)
  const stars = score >= 70 ? 5 : score >= 55 ? 4 : score >= 35 ? 3 : score >= 15 ? 2 : 1;

  return { score, stars, breakdown };
};

/**
 * 分析個股進場潛力
 * 星數由量化評分決定，AI 只負責寫分析文字
 */
export const analyzeEntry = async (symbol, companyName, newsItems, priceData, revenueData = null, chipsData = null, brokersData = null, extraData = {}) => {
  // 先用量化規則計算星數（不依賴 AI 主觀判定）
  const quant = quantitativeScore(priceData, chipsData, revenueData, brokersData, extraData);
  logger.info('Gemini API', `${symbol} 量化評分: ${quant.score}分 → ${quant.stars}星 | ${quant.breakdown.join(', ')}`);

  // 若沒有 AI 模型，直接回傳量化結果
  if (!model) {
    return {
      symbol,
      company_name: companyName,
      sentiment: quant.stars >= 4 ? 'BULLISH' : quant.stars <= 2 ? 'BEARISH' : 'NEUTRAL',
      confidence_stars: quant.stars,
      catalyst: `量化評分 ${quant.score} 分（${quant.breakdown.join(' / ')}）`,
      action_plan: quant.stars >= 5 ? '量化條件極強，可考慮明日進場' : '量化條件不足，暫緩觀望'
    };
  }

  // AI 負責：根據新聞與數據撰寫「引爆點」與「操作建議」文字
  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
    const prompt = `你是個殺伐果斷但說話接地氣的台股老手。請分析以下這檔股票：

股票：${symbol} ${companyName}
量化評分：${quant.score} 分 → ${quant.stars} 顆星
評分明細：${quant.breakdown.join(' / ')}

近期新聞：
${newsText}

價量：漲幅 ${priceData?.changePercent || 0}%，量比 ${priceData?.volumeRatio || 'N/A'}x
月營收年增率：${revenueData?.yoy || revenueData?.yearOverYearGrowth || '無資料'}%
法人：外資 ${chipsData?.foreign > 0 ? '買超' : '賣超'} / 投信 ${chipsData?.trust > 0 ? '買超' : '賣超'}

請根據以上資料，嚴格給予 1-5 顆星評分 (confidence_stars)，並用極度白話文寫出：
1. catalyst（引爆點）：請解釋為什麼給這個分數？這檔股票在漲什麼？(若是盤前則預測今日開盤)
2. action_plan（操作建議）：現在該怎麼做？直接講要不要上車？或者這是來騙散戶抓交替的？

⚠️ 語氣與文字要求：
1. 【絕對禁止使用財經術語】（不要講 MoM、YoY、流動性、隔日沖券商），把它翻譯成連菜市場阿嬤都聽得懂的白話文！
2. 語氣要極度白話、直接、帶點江湖味！
3. 【絕對不要打官腔】！絕對禁止出現「建議觀望」、「待籌碼穩定後再評估」、「投資盈虧自負」這類廢話！直接點破這是在玩真的還是主力在倒貨！`;

  try {
    const result = await model.entry.generateContent(prompt);
    const text = result.response.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch (_) {}

    // 判斷是否為盤前 (早上 9 點前)
    const now = new Date();
    const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    const isPreMarket = taiwanTime.getHours() < 9;

    return {
      symbol,
      company_name: parsed.company_name || companyName,
      sentiment: parsed.sentiment || (quant.stars >= 4 ? 'BULLISH' : quant.stars <= 2 ? 'BEARISH' : 'NEUTRAL'),
      // 盤中/盤後嚴格使用量化星數避免 AI 浮濫給星造成洗版，只有盤前（無量價數據）才允許 AI 依據新聞加分
      confidence_stars: isPreMarket ? Math.max(quant.stars, parsed.confidence_stars || 1) : quant.stars,
      catalyst: parsed.catalyst || `量化評分 ${quant.score} 分（${quant.breakdown.join(' / ')}）`,
      action_plan: parsed.action_plan || (quant.stars >= 5 ? '量化條件極強，可考慮明日進場' : '觀望')
    };
  } catch (error) {
    logger.error('Gemini API', `${symbol} AI 文字分析失敗`, error);
    return {
      symbol,
      company_name: companyName,
      sentiment: quant.stars >= 4 ? 'BULLISH' : 'NEUTRAL',
      confidence_stars: quant.stars,
      catalyst: `量化評分 ${quant.score} 分（${quant.breakdown.join(' / ')}）`,
      action_plan: quant.stars >= 5 ? '量化條件符合，可考慮明日開盤進場' : '量化條件不足，暫緩觀望'
    };
  }
};


/**
 * 分析持股是否應出場
 */
export const analyzeExit = async (symbol, companyName, position, newsItems, revenueData = null, chipsData = null) => {
  if (!model) return null;

  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title || n}`).join('\n');
  const prompt = `你是個殺伐果斷但說話接地氣的台股老手。請分析這檔庫存股有沒有出事：

股票：${symbol} ${companyName}
進場價格：${position.entry_price}
突發新聞：
${newsText}

請判斷這些新聞是不是出大事了。
⚠️ 絕對禁止使用財經術語，用白話文直接講到底要不要砍，或者這只是小事不用理會！絕對不要說廢話！`;

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

export const generateMarketSummaryText = async (newsItems) => {
  if (!model || !model.textExtractor) return null;
  const newsText = newsItems.map((n, i) => `${i + 1}. ${n.title}`).join('\n');
  const prompt = `你是專業的台股操盤手，現在是下午兩點，台股剛收盤。
請根據以下今天最新的新聞標題，用大約 30 到 50 個字，以「極度白話、像朋友聊天」的語氣，總結今天台股大盤到底發生什麼事（例如漲跌原因、強勢族群）。
請直接輸出總結文字，不要有任何多餘的問候語。

新聞標題：
${newsText}`;
  
  try {
    const result = await model.textExtractor.generateContent(prompt);
    return result.response.text().trim();
  } catch(e) {
    logger.error('Gemini API', '大盤總結生成失敗', e);
    return null;
  }
};
