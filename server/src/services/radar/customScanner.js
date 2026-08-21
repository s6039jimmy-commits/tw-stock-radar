/**
 * 📋 customScanner.js — 使用者專屬選股雷達
 *
 * 【執行時機】每週一~週五 08:30 (盤前)，資料基準為 T-1 昨收數據
 *
 * 【三層過濾架構】
 *  Layer 1 — 鐵血量化濾網 (Node.js 硬規則，全通才往下)
 *    1. 昨日收盤價 >= 50 元
 *    2. 昨日總成交量 > 1,000 張 (流動性保護)
 *    3. 外資買超 > 0 且 投信買超 > 0 (法人同步買進)
 *    4. 昨日收盤 = 近 20 日最高收盤 (突破近一個月高點)
 *
 *  Layer 2 — Gemini AI 審核 (嚴格 Prompt，只要 5 星)
 *    丟最新 3 則新聞，只留「實質業績利多」
 *
 *  Layer 3 — Telegram 推播
 *    只有 AI 回傳 5 星者才發通知
 */

import { getMarketSnapshot, getHistoricalCandles } from '../fugle/marketData.js';
import { updateChipsCache } from '../fundamentals/chips.js';
import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { sendCustomSignal } from '../notify/telegram.js';
import { addRadarSignal } from '../../db/database.js';
import { logger } from '../../utils/logger.js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { GEMINI_API_KEY } from '../../config/index.js';
import fetch from 'node-fetch';

// 排除前 50 大權值股 (大盤)
const BLUE_CHIPS = new Set([
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046',
  '2105','9910','6505','3231','2379','6415','3045','2345','1590','2207'
]);

// ──────────────────────────────────────────────
// Gemini 模型初始化（與主 client 分開，prompt 獨立）
// ──────────────────────────────────────────────
let aiModel = null;
if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const schema = {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        symbol: { type: SchemaType.STRING, description: '台股代號 4 碼' },
        stars: { type: SchemaType.INTEGER, description: '評分 1~5 顆星' },
        reason: { type: SchemaType.STRING, description: '一句話利多理由（無理由可填無）' }
      },
      required: ['symbol', 'stars', 'reason']
    }
  };
  aiModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1
    }
  });
}

// ──────────────────────────────────────────────
// 取得全市場 T-1 籌碼（外資 + 投信）
// ──────────────────────────────────────────────
const fetchAllChips = async () => {
  const chipsMap = new Map();
  try {
    const [twseRes, tpexRes] = await Promise.all([
      fetch('https://openapi.twse.com.tw/v1/fund/T86').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('https://www.tpex.org.tw/openapi/v1/tpex_38').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    for (const item of [...twseRes, ...tpexRes]) {
      const symbol = (item['證券代號'] || item['代號'])?.trim();
      if (!symbol) continue;
      // TWSE 欄位: 外陸資買賣超股數(不含外資自營商), 投信買賣超股數
      // TPEX 欄位: 外資及陸資買賣超股數(不含外資自營商), 投信買賣超股數
      const foreignRaw = item['外陸資買賣超股數(不含外資自營商)'] 
        || item['外資及陸資買賣超股數(不含外資自營商)'] 
        || '0';
      const trustRaw = item['投信買賣超股數'] || '0';
      chipsMap.set(symbol, {
        // API 回傳單位是「股」，除以 1000 轉換為「張」
        foreignBuyLot: parseInt(foreignRaw.replace(/,/g, ''), 10) / 1000,
        trustBuyLot: parseInt(trustRaw.replace(/,/g, ''), 10) / 1000
      });
    }
    logger.info('Custom Scanner', `籌碼快取載入完成，共 ${chipsMap.size} 檔`);
  } catch (e) {
    logger.error('Custom Scanner', '載入籌碼失敗', e.message);
  }
  return chipsMap;
};

// ──────────────────────────────────────────────
// 取得股票近 20 日 K 線資料 (T-1 為最後一筆)
// ──────────────────────────────────────────────
const getPast20DaysData = async (symbol) => {
  try {
    const toDate = new Date();
    toDate.setDate(toDate.getDate() - 1);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 40);

    const from = fromDate.toISOString().split('T')[0];
    const to = toDate.toISOString().split('T')[0];

    const candles = await getHistoricalCandles(symbol, from, to);
    if (!candles || candles.length < 10) return null;

    const recent = candles.slice(-20);
    return {
      closes: recent.map(c => c.close),
      volumes: recent.map(c => c.volume || 0)
    };
  } catch (e) {
    return null;
  }
};

// ──────────────────────────────────────────────
// Layer 1：量化濾網
//
// 校準邏輯（目標：每週 1~2 檔通過 AI 後推播）
//   全市場 ~1800 檔
//   -> 條件1 (股價>=50)：~800 檔
//   -> 條件2 (日量>500張)：~500 檔
//   -> 條件3 (法人至少一方買超，另一方不大賣)：~80 檔
//   -> 條件4 (昨收在近20日高點97%內)：~10~20 檔
//   -> Layer2 AI 5星：0~1 檔/天 = 1~2 檔/週
// ──────────────────────────────────────────────
const passesQuantFilter = async (symbol, chipsMap) => {
  // 排除前 50 大權值股
  if (BLUE_CHIPS.has(symbol)) return false;

  const chips = chipsMap.get(symbol);
  if (!chips) return false;

  // 條件 3（先做，不用呼叫 API）：
  // 法人共識 — 至少一方買超 > 0，另一方不能大幅賣超(> -500張)
  const fBuy = chips.foreignBuyLot;
  const tBuy = chips.trustBuyLot;
  if (!(fBuy > 0 || tBuy > 0)) return false;
  if (fBuy < -500 || tBuy < -500) return false;

  // 取近 20 日 K 線
  const data = await getPast20DaysData(symbol);
  if (!data) return false;

  const { closes, volumes } = data;
  const yesterdayClose = closes[closes.length - 1];

  // 條件 1：昨日收盤 >= 50 元
  if (yesterdayClose < 50) return false;

  // 條件 2：昨日成交量 > 500 張（流動性保護）
  const yesterdayVolumeLot = volumes[volumes.length - 1] / 1000;
  if (yesterdayVolumeLot < 500) return false;

  // 條件 4：昨收在近 20 日最高收盤的 97% 以上（接近突破）
  const max20 = Math.max(...closes);
  if (yesterdayClose < max20 * 0.97) return false;

  return {
    symbol,
    yesterdayClose,
    yesterdayVolumeLot: Math.round(yesterdayVolumeLot),
    foreignBuyLot: chips.foreignBuyLot,
    trustBuyLot: chips.trustBuyLot,
    max20,
    distToHigh: ((yesterdayClose / max20) * 100).toFixed(1) + '%'
  };
};

// ──────────────────────────────────────────────
// Layer 2：Gemini AI 嚴格審核
// ──────────────────────────────────────────────
const aiFilter = async (candidates) => {
  if (!aiModel || candidates.length === 0) return [];

  // 為每一檔候選股抓最新 3 則新聞
  const stockNewsBlocks = await Promise.all(
    candidates.map(async (c) => {
      try {
        const [cnyes, google] = await Promise.all([
          fetchNewsByTicker(c.symbol, 3).catch(() => []),
          fetchNewsForStock(c.symbol, c.symbol).catch(() => [])
        ]);
        const headlines = [
          ...cnyes.slice(0, 2).map(n => n.title),
          ...google.slice(0, 1).map(n => n.title)
        ].filter(Boolean).slice(0, 3);

        return `【${c.symbol}】${headlines.length > 0 ? headlines.join(' / ') : '無最新新聞'}`;
      } catch {
        return `【${c.symbol}】無法取得新聞`;
      }
    })
  );

  const prompt = `你是一位冷酷的台股量化操盤手。請閱讀以下股票的最新新聞，判斷是否具備『實質業績利多』（如：營收創高、接獲大單、法說會上修財測）。
評分標準：
- 若只是炒作題材、舊聞或無關緊要的新聞，給 1~3 星。
- 若是具備實質基本面爆發力的明確利多，給 4~5 星。
請以 JSON 格式回傳陣列，對【所有】傳入的股票進行評分（1~5星），並給出一句話的理由。
格式範例：[{"symbol": "2330", "stars": 5, "reason": "單月營收年增達40%創歷史新高"}]

待審股票新聞如下：
${stockNewsBlocks.join('\n')}`;

  try {
    const result = await aiModel.generateContent(prompt);
    const text = result.response.text();
    const parsed = JSON.parse(text);
    logger.info('Custom Scanner', `AI 審核完成，已評分: ${parsed.length} 檔`);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.error('Custom Scanner', 'AI 審核失敗', e.message);
    return [];
  }
};

// ──────────────────────────────────────────────
// Layer 3：資料庫寫入 & Telegram 推播
// ──────────────────────────────────────────────
const pushResults = async (aiResults, candidateMap) => {
  for (const item of aiResults) {
    const meta = candidateMap.get(item.symbol);
    if (!meta) continue;

    const signal = {
      symbol: item.symbol,
      name: item.symbol, // 可以加上 API 去抓真實名字
      signal_type: 'CUSTOM_STRATEGY',
      ai_stars: item.stars || 1,
      ai_sentiment: item.stars >= 4 ? 'BULLISH' : 'NEUTRAL',
      ai_reasoning: item.reason,
      news_headline: item.reason,
      current_price: meta.yesterdayClose,
      volume_ratio: 1.0,
      extra: `外資: +${meta.foreignBuyLot.toFixed(0)}張 / 投信: +${meta.trustBuyLot.toFixed(0)}張 / 昨收: NT$${meta.yesterdayClose} (近20日高點區)`
    };

    // 所有通過 Layer 1 的都寫入資料庫（雷達介面上看得到）
    try {
      await addRadarSignal(signal);
    } catch (e) {
      logger.warn('Custom Scanner', `寫入DB失敗 ${item.symbol}: ${e.message}`);
    }

    // ★ 只有 5 顆星才推送到 Telegram
    if (item.stars === 5) {
      try {
        await sendCustomSignal(signal);
        logger.info('Custom Scanner', `✅ Telegram 5星強勢推播: ${item.symbol}`);
      } catch (e) {
        logger.error('Custom Scanner', `Telegram 推播失敗 ${item.symbol}`, e.message);
      }
    }
  }
};

// ──────────────────────────────────────────────
// 主掃描函式 (export)
// ──────────────────────────────────────────────
export const scan = async () => {
  logger.info('Custom Scanner', '🔍 啟動使用者專屬選股雷達 (T-1 籌碼基準)...');

  // Step 1: 取得全市場籌碼快照 (TWSE + TPEX)
  const chipsMap = await fetchAllChips();
  if (chipsMap.size === 0) {
    logger.warn('Custom Scanner', '籌碼資料為空，終止掃描');
    return [];
  }

  // Step 2: 對全市場每一檔做 Layer 1 鐵血濾網
  const allSymbols = Array.from(chipsMap.keys());
  logger.info('Custom Scanner', `共 ${allSymbols.length} 檔進入量化濾網...`);

  const layer1Results = [];
  // 並發但分批 (每批 30 檔，避免 API 爆量)
  const BATCH_SIZE = 30;
  for (let i = 0; i < allSymbols.length; i += BATCH_SIZE) {
    const batch = allSymbols.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(sym => passesQuantFilter(sym, chipsMap))
    );
    batchResults.forEach(r => { if (r) layer1Results.push(r); });
  }

  logger.info('Custom Scanner', `Layer 1 通過: ${layer1Results.length} 檔 → ${layer1Results.map(r => r.symbol).join(', ') || '無'}`);
  if (layer1Results.length === 0) return [];

  // Step 3: Layer 2 — AI 嚴格審核
  const aiPassed = await aiFilter(layer1Results);
  if (aiPassed.length === 0) {
    logger.info('Custom Scanner', '⚠️ AI 審核：無任何股票達到 5 星標準，今日無推播');
    return [];
  }

  // Step 4: Layer 3 — Telegram 推播
  const candidateMap = new Map(layer1Results.map(r => [r.symbol, r]));
  await pushResults(aiPassed, candidateMap);

  logger.info('Custom Scanner', `🎯 掃描完成，共推播 ${aiPassed.length} 檔`);
  return aiPassed;
};
