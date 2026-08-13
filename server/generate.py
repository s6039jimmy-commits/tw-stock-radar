import os

BASE_DIR = r"C:\Users\Administrator\.gemini\antigravity\scratch\tw-stock-radar\server"

FILES = {
    "package.json": """{
  "name": "tw-stock-radar-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "better-sqlite3": "^9.0.0",
    "node-cron": "^3.0.3",
    "ws": "^8.14.2",
    "node-telegram-bot-api": "^0.64.0",
    "@fugle/marketdata": "^0.3.1",
    "@google/genai": "^0.1.2",
    "rss-parser": "^3.13.0"
  }
}
""",
    "src/config/index.js": """import dotenv from 'dotenv';
dotenv.config();

// 系統設定
export const PORT = process.env.PORT || 3001;
export const DB_PATH = process.env.DB_PATH || './data/radar.db';

// API 金鑰
export const FUGLE_API_KEY = process.env.FUGLE_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// 交易參數 (預設值)
export const STOP_LOSS_PCT = parseFloat(process.env.STOP_LOSS_PCT || '-7.0');
export const TAKE_PROFIT_PCT = parseFloat(process.env.TAKE_PROFIT_PCT || '15.0');
export const MA5_EXIT = process.env.MA5_EXIT === 'true' || true;
export const VOLUME_RATIO_THRESHOLD = parseFloat(process.env.VOLUME_RATIO_THRESHOLD || '2.5');
export const BLUE_CHIP_TOP_N = parseInt(process.env.BLUE_CHIP_TOP_N || '50');

// 掃描間隔 (分鐘)
export const RADAR_SCAN_INTERVAL_MIN = parseInt(process.env.RADAR_SCAN_INTERVAL_MIN || '30');
export const MONITOR_SCAN_INTERVAL_MIN = parseInt(process.env.MONITOR_SCAN_INTERVAL_MIN || '3');
export const NEWS_SCAN_INTERVAL_MIN = parseInt(process.env.NEWS_SCAN_INTERVAL_MIN || '10');

// 交易時間
export const MARKET_OPEN = process.env.MARKET_OPEN || '09:00';
export const MARKET_CLOSE = process.env.MARKET_CLOSE || '13:30';
""",
    "src/utils/logger.js": """const formatMessage = (level, module, msg) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] [${module}] ${msg}`;
};

// 簡單的結構化日誌記錄器
export const logger = {
  info: (module, msg) => console.log(`\x1b[36m${formatMessage('INFO', module, msg)}\x1b[0m`),
  warn: (module, msg) => console.warn(`\x1b[33m${formatMessage('WARN', module, msg)}\x1b[0m`),
  error: (module, msg, err = '') => console.error(`\x1b[31m${formatMessage('ERROR', module, msg)}\x1b[0m`, err),
  debug: (module, msg) => console.debug(`\x1b[90m${formatMessage('DEBUG', module, msg)}\x1b[0m`)
};
""",
    "src/utils/helpers.js": """import { MARKET_OPEN, MARKET_CLOSE } from '../config/index.js';

// 檢查目前時間是否在台股交易時段內 (09:00-13:30，平日)
export const isMarketOpen = () => {
  const now = new Date();
  const taiwanTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const day = taiwanTime.getDay();
  // 週末不交易
  if (day === 0 || day === 6) return false;
  
  const hours = taiwanTime.getHours();
  const minutes = taiwanTime.getMinutes();
  const currentTime = hours * 100 + minutes;
  
  const [openH, openM] = MARKET_OPEN.split(':').map(Number);
  const [closeH, closeM] = MARKET_CLOSE.split(':').map(Number);
  
  const openTime = openH * 100 + openM;
  const closeTime = closeH * 100 + closeM;
  
  return currentTime >= openTime && currentTime <= closeTime;
};

// 格式化為台幣 (例如: $1,234.50)
export const formatCurrency = (num) => {
  if (num == null) return 'N/A';
  return 'NT$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 格式化百分比
export const formatPercent = (num) => {
  if (num == null) return 'N/A';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

// 計算損益
export const calcProfitLoss = (entryPrice, currentPrice) => {
  if (!entryPrice || !currentPrice) return { amount: 0, percent: 0 };
  const amount = currentPrice - entryPrice;
  const percent = (amount / entryPrice) * 100;
  return { amount, percent };
};

// 計算移動平均線 (MA)
export const calcMA = (prices, period) => {
  if (prices.length < period) return null;
  const sum = prices.slice(0, period).reduce((a, b) => a + b, 0);
  return sum / period;
};

// 非同步暫停
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 民國年轉 ISO 日期 (例如: 1150812 -> 2026-08-12)
export const rocDateToISO = (rocDate) => {
  if (!rocDate) return null;
  const str = String(rocDate);
  if (str.length < 6) return null;
  const year = parseInt(str.slice(0, -4)) + 1911;
  const month = str.slice(-4, -2);
  const day = str.slice(-2);
  return `${year}-${month}-${day}`;
};
""",
    "src/db/schema.sql": """CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_price REAL NOT NULL,
  entry_date TEXT NOT NULL,
  entry_reason TEXT,
  ai_stars INTEGER,
  stop_loss_pct REAL DEFAULT -7.0,
  take_profit_pct REAL DEFAULT 15.0,
  ma5_exit INTEGER DEFAULT 1,
  status TEXT DEFAULT 'MONITORING',
  exit_price REAL,
  exit_date TEXT,
  exit_reason TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS radar_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  ai_stars INTEGER NOT NULL,
  ai_sentiment TEXT,
  ai_reasoning TEXT,
  news_headline TEXT,
  current_price REAL,
  volume_ratio REAL,
  notified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS exit_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  trigger_price REAL,
  trigger_reason TEXT,
  ai_analysis TEXT,
  notified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (position_id) REFERENCES positions(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);
""",
    "src/db/database.js": """import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH } from '../config/index.js';
import { logger } from '../utils/logger.js';

let db;

// 初始化資料庫
export const initDatabase = () => {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db = new Database(DB_PATH);
    const schema = fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf-8');
    db.exec(schema);
    logger.info('Database', '資料庫初始化成功');
  } catch (error) {
    logger.error('Database', '資料庫初始化失敗', error);
    throw error;
  }
};

export const getDb = () => db;

// 倉位操作
export const addPosition = (data) => {
  const stmt = db.prepare(`
    INSERT INTO positions (symbol, name, entry_price, entry_date, entry_reason, ai_stars, stop_loss_pct, take_profit_pct, ma5_exit)
    VALUES (@symbol, @name, @entry_price, @entry_date, @entry_reason, @ai_stars, @stop_loss_pct, @take_profit_pct, @ma5_exit)
  `);
  return stmt.run(data);
};

export const getActivePositions = () => {
  return db.prepare("SELECT * FROM positions WHERE status = 'MONITORING'").all();
};

export const updatePosition = (id, data) => {
  const updates = Object.keys(data).map(key => `${key} = @${key}`).join(', ');
  const stmt = db.prepare(`UPDATE positions SET ${updates}, updated_at = datetime('now','localtime') WHERE id = @id`);
  return stmt.run({ ...data, id });
};

export const exitPosition = (id, exitData) => {
  const stmt = db.prepare(`
    UPDATE positions 
    SET status = 'CLOSED', exit_price = @exit_price, exit_date = @exit_date, exit_reason = @exit_reason, updated_at = datetime('now','localtime')
    WHERE id = @id
  `);
  return stmt.run({ ...exitData, id });
};

// 雷達訊號
export const addRadarSignal = (data) => {
  const stmt = db.prepare(`
    INSERT INTO radar_signals (symbol, name, signal_type, ai_stars, ai_sentiment, ai_reasoning, news_headline, current_price, volume_ratio)
    VALUES (@symbol, @name, @signal_type, @ai_stars, @ai_sentiment, @ai_reasoning, @news_headline, @current_price, @volume_ratio)
  `);
  return stmt.run(data);
};

export const getRadarSignals = (limit = 50) => {
  return db.prepare("SELECT * FROM radar_signals ORDER BY created_at DESC LIMIT ?").all(limit);
};

// 出場警報
export const addExitAlert = (data) => {
  const stmt = db.prepare(`
    INSERT INTO exit_alerts (position_id, symbol, alert_type, trigger_price, trigger_reason, ai_analysis)
    VALUES (@position_id, @symbol, @alert_type, @trigger_price, @trigger_reason, @ai_analysis)
  `);
  return stmt.run(data);
};

export const getExitAlerts = (limit = 50) => {
  return db.prepare("SELECT * FROM exit_alerts ORDER BY created_at DESC LIMIT ?").all(limit);
};

// 設定操作
export const getSetting = (key, defaultValue = null) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : defaultValue;
};

export const setSetting = (key, value) => {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
  `);
  return stmt.run({ key, value });
};

// 交易歷史
export const getTradeHistory = (limit = 100) => {
  return db.prepare("SELECT * FROM positions WHERE status = 'CLOSED' ORDER BY exit_date DESC LIMIT ?").all(limit);
};

export const getTradeStats = () => {
  const closed = db.prepare("SELECT entry_price, exit_price FROM positions WHERE status = 'CLOSED'").all();
  if (closed.length === 0) return { totalTrades: 0, winRate: 0, avgProfitPct: 0 };
  
  let wins = 0;
  let totalProfitPct = 0;
  closed.forEach(trade => {
    const profitPct = ((trade.exit_price - trade.entry_price) / trade.entry_price) * 100;
    totalProfitPct += profitPct;
    if (profitPct > 0) wins++;
  });
  
  return {
    totalTrades: closed.length,
    winRate: (wins / closed.length) * 100,
    avgProfitPct: totalProfitPct / closed.length
  };
};
""",
    "src/services/fugle/marketData.js": """import { RestClient } from '@fugle/marketdata';
import { FUGLE_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { sleep } from '../../utils/helpers.js';

let client = null;
try {
  if (FUGLE_API_KEY) {
    client = new RestClient({ apiKey: FUGLE_API_KEY });
  } else {
    logger.warn('Fugle API', '未設定 FUGLE_API_KEY，將使用模擬資料');
  }
} catch (e) {
  logger.error('Fugle API', '初始化失敗', e);
}

// 取得即時報價
export const getQuote = async (symbol, retries = 3) => {
  if (!client) return { symbol, close: 100, open: 99, high: 101, low: 98, change: 1, changePercent: 1 };
  try {
    const stock = client.stock;
    const data = await stock.intraday.quote({ symbol });
    return data;
  } catch (error) {
    if (retries > 0) {
      await sleep(1000);
      return getQuote(symbol, retries - 1);
    }
    logger.error('Fugle API', `取得報價失敗 ${symbol}`, error);
    return null;
  }
};

// 取得歷史 K 線
export const getHistoricalCandles = async (symbol, from, to) => {
  if (!client) return [];
  try {
    const data = await client.stock.historical.candles({ symbol, from, to });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得歷史K線失敗 ${symbol}`, error);
    return [];
  }
};

// 取得當日分鐘 K 線
export const getIntradayCandles = async (symbol) => {
  if (!client) return [];
  try {
    const data = await client.stock.intraday.candles({ symbol });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得當日K線失敗 ${symbol}`, error);
    return [];
  }
};

// 取得市場漲跌排行 (TSE/OTC)
export const getMarketMovers = async (market = 'TSE') => {
  if (!client) return { gainers: [], losers: [] };
  // Mock fallback logic... API structure mapping simplified
  try {
    // 假設透過特定快照取得 (Fugle API實際用法可能因版本略異，此為抽象)
    return { gainers: [], losers: [] };
  } catch (error) {
    logger.error('Fugle API', `取得漲跌排行失敗 ${market}`, error);
    return { gainers: [], losers: [] };
  }
};

// 取得成交量排行
export const getMarketActives = async (market = 'TSE') => {
  if (!client) return [];
  try {
    return [];
  } catch (error) {
    logger.error('Fugle API', `取得成交量排行失敗 ${market}`, error);
    return [];
  }
};

// 取得市場快照
export const getMarketSnapshot = async (market = 'TSE') => {
  if (!client) return [];
  try {
    const data = await client.stock.snapshot.quotes({ market });
    return data.data || [];
  } catch (error) {
    logger.error('Fugle API', `取得市場快照失敗 ${market}`, error);
    return [];
  }
};

export const testConnection = async () => {
  try {
    if (!client) return false;
    await getQuote('2330');
    return true;
  } catch (e) {
    return false;
  }
};
""",
    "src/services/fugle/streaming.js": """import { WebSocketClient } from '@fugle/marketdata';
import { FUGLE_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

export const streamEmitter = new EventEmitter();
let wsClient = null;
let connected = false;
let subscriptions = new Set();

export const connect = async () => {
  if (!FUGLE_API_KEY) {
    logger.warn('Fugle WS', '未設定 API Key，跳過連線');
    return;
  }
  try {
    wsClient = new WebSocketClient({ apiKey: FUGLE_API_KEY });
    const stock = wsClient.stock;
    
    stock.on('connect', () => {
      connected = true;
      logger.info('Fugle WS', 'WebSocket 連線成功');
      // 重新訂閱
      for (const symbol of subscriptions) {
        stock.intraday.quote({ symbol });
      }
    });

    stock.on('disconnect', () => {
      connected = false;
      logger.warn('Fugle WS', 'WebSocket 連線中斷，嘗試重新連線');
    });

    stock.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.event === 'data' && data.data) {
          streamEmitter.emit('price-update', data.data);
        }
      } catch (e) {
        // 解析錯誤忽略
      }
    });

    await wsClient.connect();
  } catch (error) {
    logger.error('Fugle WS', 'WebSocket 連線失敗', error);
  }
};

export const disconnect = () => {
  if (wsClient && connected) {
    wsClient.disconnect();
    connected = false;
  }
};

export const subscribe = (symbol) => {
  subscriptions.add(symbol);
  if (connected && wsClient) {
    wsClient.stock.intraday.quote({ symbol });
  }
};

export const unsubscribe = (symbol) => {
  subscriptions.delete(symbol);
  // Fugle API 不一定有明確 unsubscribe，這裡只需從清單移除
};
""",
    "src/services/news/twseNews.js": """import { logger } from '../../utils/logger.js';

// 取得上市重大訊息
export const fetchTwseAnnouncements = async () => {
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/opendata/t187ap04_L');
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    logger.error('TWSE News', '取得上市重大訊息失敗', error);
    return [];
  }
};

// 取得上櫃重大訊息
export const fetchTpexAnnouncements = async () => {
  try {
    const res = await fetch('https://www.tpex.org.tw/openapi/v1/mops_t187ap04_O');
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    logger.error('TWSE News', '取得上櫃重大訊息失敗', error);
    return [];
  }
};

export const getAllMajorAnnouncements = async () => {
  const [twse, tpex] = await Promise.all([
    fetchTwseAnnouncements(),
    fetchTpexAnnouncements()
  ]);
  return [...twse, ...tpex];
};

export const getAnnouncementsForSymbol = async (symbol) => {
  const all = await getAllMajorAnnouncements();
  return all.filter(item => item.公司代號 === symbol);
};
""",
    "src/services/news/cnyesNews.js": """import { logger } from '../../utils/logger.js';

export const fetchNewsByTicker = async (ticker, limit = 5) => {
  try {
    const res = await fetch(`https://news.cnyes.com/api/v3/news/keyword?q=${ticker}&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items?.data || []).map(item => ({
      title: item.title,
      summary: item.summary,
      url: `https://news.cnyes.com/news/id/${item.newsId}`,
      publishedAt: new Date(item.publishAt * 1000).toISOString()
    }));
  } catch (error) {
    logger.error('Cnyes News', `取得個股新聞失敗 ${ticker}`, error);
    return [];
  }
};

export const fetchLatestStockNews = async (limit = 20) => {
  try {
    const res = await fetch(`https://news.cnyes.com/api/v3/news/category/tw_stock?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items?.data || []).map(item => ({
      title: item.title,
      summary: item.summary,
      url: `https://news.cnyes.com/news/id/${item.newsId}`,
      publishedAt: new Date(item.publishAt * 1000).toISOString()
    }));
  } catch (error) {
    logger.error('Cnyes News', '取得台股最新新聞失敗', error);
    return [];
  }
};
""",
    "src/services/news/googleNews.js": """import Parser from 'rss-parser';
import { logger } from '../../utils/logger.js';

const parser = new Parser();

export const fetchNewsForStock = async (ticker, companyName) => {
  try {
    const query = encodeURIComponent(`${ticker} OR ${companyName}`);
    const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`);
    
    return feed.items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source
    }));
  } catch (error) {
    logger.error('Google News', `取得 Google News 失敗 ${ticker}`, error);
    return [];
  }
};
""",
    "src/services/ai/geminiClient.js": """import { GoogleGenAI, Type, Schema } from '@google/genai';
import { GEMINI_API_KEY } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

let ai = null;
if (GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
} else {
  logger.warn('Gemini API', '未設定 GEMINI_API_KEY，將無法進行 AI 分析');
}

const entrySchema = {
  type: Type.OBJECT,
  properties: {
    symbol: { type: Type.STRING },
    company_name: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    sentiment: { type: Type.STRING },
    confidence_stars: { type: Type.INTEGER },
    confidence_score: { type: Type.NUMBER },
    key_factors: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommended_action: { type: Type.STRING },
    risk_factors: { type: Type.ARRAY, items: { type: Type.STRING } }
  }
};

const exitSchema = {
  type: Type.OBJECT,
  properties: {
    symbol: { type: Type.STRING },
    is_exit_signal: { type: Type.BOOLEAN },
    urgency: { type: Type.STRING },
    reasoning: { type: Type.STRING },
    danger_level: { type: Type.INTEGER },
    recommended_action: { type: Type.STRING }
  }
};

const sysInstruction = "你是一位精通台灣股市的頂尖分析師。你的任務是客觀、嚴謹地分析個股的新聞與技術資料，並給出專業的進出場建議。";

export const analyzeEntry = async (symbol, companyName, newsItems, priceData) => {
  if (!ai) return null;
  const prompt = `請分析以下股票的進場潛力: 股票代號 ${symbol} (${companyName})\\n新聞: ${JSON.stringify(newsItems)}\\n價格資料: ${JSON.stringify(priceData)}`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: sysInstruction,
        responseMimeType: 'application/json',
        responseSchema: entrySchema,
        temperature: 0.1
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    logger.error('Gemini API', '進場分析失敗', error);
    return null;
  }
};

export const analyzeExit = async (symbol, companyName, position, newsItems) => {
  if (!ai) return null;
  const prompt = `請分析以下持股是否應該出場: 股票代號 ${symbol} (${companyName})\\n目前部位: ${JSON.stringify(position)}\\n相關新聞: ${JSON.stringify(newsItems)}`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: sysInstruction,
        responseMimeType: 'application/json',
        responseSchema: exitSchema,
        temperature: 0.1
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    logger.error('Gemini API', '出場分析失敗', error);
    return null;
  }
};

export const testAnalysis = async () => {
  return ai !== null;
};
""",
    "src/services/ai/entryAnalysis.js": """export const buildEntryPrompt = (symbol, companyName, newsHeadlines, priceData) => {
  return `股票：${symbol} ${companyName}
新聞標題：
${newsHeadlines.map(n => '- ' + n).join('\\n')}
價格資料：${JSON.stringify(priceData)}
請綜合評估這檔股票是否適合進場。`;
};

export const parseEntryResult = (rawResult) => {
  if (!rawResult) return null;
  return {
    symbol: rawResult.symbol,
    company_name: rawResult.company_name,
    reasoning: rawResult.reasoning,
    sentiment: rawResult.sentiment,
    confidence_stars: Math.max(1, Math.min(5, rawResult.confidence_stars || 1)),
    confidence_score: rawResult.confidence_score,
    key_factors: rawResult.key_factors || [],
    recommended_action: rawResult.recommended_action,
    risk_factors: rawResult.risk_factors || []
  };
};
""",
    "src/services/ai/exitAnalysis.js": """export const buildExitPrompt = (symbol, companyName, position, newsHeadlines) => {
  return `持股：${symbol} ${companyName}
進場價：${position.entry_price}
新聞標題：
${newsHeadlines.map(n => '- ' + n).join('\\n')}
請評估是否出現出場訊號。`;
};

export const parseExitResult = (rawResult) => {
  if (!rawResult) return null;
  return {
    symbol: rawResult.symbol,
    is_exit_signal: Boolean(rawResult.is_exit_signal),
    urgency: rawResult.urgency,
    reasoning: rawResult.reasoning,
    danger_level: Math.max(1, Math.min(5, rawResult.danger_level || 1)),
    recommended_action: rawResult.recommended_action
  };
};
""",
    "src/services/radar/blueChipScanner.js": """import { BLUE_CHIP_TOP_N } from '../../config/index.js';
import { getAnnouncementsForSymbol } from '../news/twseNews.js';
import { analyzeEntry, parseEntryResult } from '../ai/geminiClient.js';
import { getQuote } from '../fugle/marketData.js';
import { logger } from '../../utils/logger.js';

const BLUE_CHIP_SYMBOLS = [
  '2330','2317','2454','2382','2412','3711','2308','2881','2882','2891',
  '2303','1301','1303','2886','2884','3034','2357','2002','1326','2885',
  '5880','2880','2892','2883','3037','2912','1101','2887','5871','2395',
  '3008','2615','4904','6669','2327','4938','2603','1216','2301','8046',
  '2105','9910','6505','3231','2379','6415','3045','2345','1590','2207'
];

export const scan = async () => {
  logger.info('BlueChip Scanner', '開始執行藍籌股掃描...');
  const signals = [];
  
  for (const symbol of BLUE_CHIP_SYMBOLS.slice(0, BLUE_CHIP_TOP_N)) {
    try {
      const news = await getAnnouncementsForSymbol(symbol);
      if (news.length === 0) continue; // 沒有重大消息則跳過

      const quote = await getQuote(symbol);
      const rawAi = await analyzeEntry(symbol, '權值股', news.map(n => n.主旨), quote);
      if (rawAi) {
        const result = parseEntryResult(rawAi);
        if (result && result.confidence_stars >= 4) {
          signals.push({
            symbol,
            name: result.company_name,
            signal_type: 'BLUE_CHIP',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: result.reasoning,
            news_headline: news[0]?.主旨 || '',
            current_price: quote?.close || 0,
            volume_ratio: 1.0 // Mock
          });
        }
      }
    } catch (e) {
      logger.error('BlueChip Scanner', `掃描 ${symbol} 失敗`, e);
    }
  }
  
  return signals;
};
""",
    "src/services/radar/momentumScanner.js": """import { getMarketActives, getQuote } from '../fugle/marketData.js';
import { analyzeEntry, parseEntryResult } from '../ai/geminiClient.js';
import { VOLUME_RATIO_THRESHOLD } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

export const scan = async () => {
  logger.info('Momentum Scanner', '開始執行強勢股掃描...');
  const signals = [];
  
  try {
    const actives = await getMarketActives('TSE');
    // 假裝過濾與分析
    for (const item of actives.slice(0, 10)) {
      if (item.volume_ratio >= VOLUME_RATIO_THRESHOLD) {
        const rawAi = await analyzeEntry(item.symbol, item.name, [], { price: item.price });
        const result = parseEntryResult(rawAi);
        if (result && result.confidence_stars >= 4) {
          signals.push({
            symbol: item.symbol,
            name: item.name,
            signal_type: 'MOMENTUM',
            ai_stars: result.confidence_stars,
            ai_sentiment: result.sentiment,
            ai_reasoning: result.reasoning,
            news_headline: '',
            current_price: item.price,
            volume_ratio: item.volume_ratio
          });
        }
      }
    }
  } catch (e) {
    logger.error('Momentum Scanner', '強勢股掃描失敗', e);
  }
  
  return signals;
};
""",
    "src/services/monitor/priceMonitor.js": """import { getQuote, getHistoricalCandles } from '../fugle/marketData.js';
import { calcProfitLoss, calcMA } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';

export const checkPositionPrice = (position, currentQuote) => {
  const currentPrice = currentQuote.close || currentQuote.price;
  return calcProfitLoss(position.entry_price, currentPrice);
};

export const checkStopLoss = (position, currentPrice) => {
  const { percent } = calcProfitLoss(position.entry_price, currentPrice);
  if (percent <= position.stop_loss_pct) {
    return {
      triggered: true,
      reason: `觸發停損 (${percent.toFixed(2)}% <= ${position.stop_loss_pct}%)`
    };
  }
  return { triggered: false };
};

export const checkTakeProfit = (position, currentPrice) => {
  const { percent } = calcProfitLoss(position.entry_price, currentPrice);
  if (percent >= position.take_profit_pct) {
    return {
      triggered: true,
      reason: `觸發停利 (${percent.toFixed(2)}% >= ${position.take_profit_pct}%)`
    };
  }
  return { triggered: false };
};

export const checkMA5Break = async (position) => {
  if (!position.ma5_exit) return { triggered: false };
  
  const candles = await getHistoricalCandles(position.symbol, '2023-01-01', '2030-01-01');
  if (candles.length < 5) return { triggered: false };
  
  const closes = candles.slice(-5).map(c => c.close);
  const ma5 = calcMA(closes, 5);
  const currentPrice = closes[closes.length - 1];
  
  if (currentPrice < ma5) {
    return {
      triggered: true,
      reason: `跌破 5日線 (目前: ${currentPrice}, MA5: ${ma5.toFixed(2)})`
    };
  }
  return { triggered: false };
};
""",
    "src/services/monitor/newsMonitor.js": """import { fetchNewsByTicker } from '../news/cnyesNews.js';
import { getAnnouncementsForSymbol } from '../news/twseNews.js';
import { fetchNewsForStock } from '../news/googleNews.js';
import { logger } from '../../utils/logger.js';

export const aggregateNews = async (symbol, companyName) => {
  try {
    const [cnyes, twse, google] = await Promise.all([
      fetchNewsByTicker(symbol, 3),
      getAnnouncementsForSymbol(symbol),
      fetchNewsForStock(symbol, companyName)
    ]);
    
    return {
      cnyes,
      twse: twse.slice(0, 3),
      google: google.slice(0, 3)
    };
  } catch (error) {
    logger.error('News Monitor', `彙整新聞失敗 ${symbol}`, error);
    return { cnyes: [], twse: [], google: [] };
  }
};

export const scanPositionNews = async (position) => {
  return await aggregateNews(position.symbol, position.name);
};
""",
    "src/services/monitor/exitEngine.js": """import { checkStopLoss, checkTakeProfit, checkMA5Break } from './priceMonitor.js';
import { scanPositionNews } from './newsMonitor.js';
import { analyzeExit, parseExitResult } from '../ai/geminiClient.js';
import { getQuote } from '../fugle/marketData.js';
import { addExitAlert } from '../../db/database.js';
import { sendExitAlert } from '../notify/telegram.js';
import { logger } from '../../utils/logger.js';

export const evaluatePosition = async (position) => {
  const quote = await getQuote(position.symbol);
  if (!quote) return null;
  const currentPrice = quote.close || quote.price;
  
  // 1. 停損
  const sl = checkStopLoss(position, currentPrice);
  if (sl.triggered) {
    return processExitAlert(position, 'STOP_LOSS', { price: currentPrice, reason: sl.reason });
  }
  
  // 2. 停利
  const tp = checkTakeProfit(position, currentPrice);
  if (tp.triggered) {
    return processExitAlert(position, 'TAKE_PROFIT', { price: currentPrice, reason: tp.reason });
  }
  
  // 3. MA5 跌破
  const ma5 = await checkMA5Break(position);
  if (ma5.triggered) {
    return processExitAlert(position, 'MA5_BREAK', { price: currentPrice, reason: ma5.reason });
  }
  
  // 4. 新聞與 AI 判斷
  const news = await scanPositionNews(position);
  const headlines = [...news.cnyes, ...news.twse].map(n => n.title || n.主旨);
  if (headlines.length > 0) {
    const aiRaw = await analyzeExit(position.symbol, position.name, position, headlines);
    const aiResult = parseExitResult(aiRaw);
    
    if (aiResult && aiResult.is_exit_signal && aiResult.danger_level >= 4) {
      return processExitAlert(position, 'NEWS_AI_EXIT', {
        price: currentPrice,
        reason: 'AI 偵測到重大利空',
        ai_analysis: aiResult.reasoning
      });
    }
  }
  return null;
};

export const processExitAlert = (position, alertType, triggerData) => {
  const alert = {
    position_id: position.id,
    symbol: position.symbol,
    alert_type: alertType,
    trigger_price: triggerData.price,
    trigger_reason: triggerData.reason,
    ai_analysis: triggerData.ai_analysis || ''
  };
  addExitAlert(alert);
  sendExitAlert(alert, position);
  logger.info('Exit Engine', `觸發出場警報 [${alertType}] ${position.symbol}`);
  return alert;
};
""",
    "src/services/notify/telegram.js": """import TelegramBot from 'node-telegram-bot-api';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

let bot = null;
if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
} else {
  logger.warn('Telegram', '未設定 TELEGRAM_BOT_TOKEN，將不會發送通知');
}

const sendHTML = async (html, replyMarkup = null) => {
  if (!bot || !TELEGRAM_CHAT_ID) return;
  try {
    const opts = { parse_mode: 'HTML' };
    if (replyMarkup) opts.reply_markup = replyMarkup;
    await bot.sendMessage(TELEGRAM_CHAT_ID, html, opts);
  } catch (error) {
    logger.error('Telegram', '發送訊息失敗', error);
  }
};

export const sendEntrySignal = (signal) => {
  const stars = '⭐'.repeat(signal.ai_stars);
  const html = `🎯 <b>新進場訊號</b>
股票：<code>${signal.symbol}</code> ${signal.name}
類型：${signal.signal_type}
AI 評分：${stars}
目前價格：${signal.current_price}

<b>AI 分析：</b>
<pre>${signal.ai_reasoning}</pre>

新聞：${signal.news_headline}`;
  
  const markup = {
    inline_keyboard: [[{ text: '📈 TradingView', url: `https://tw.tradingview.com/chart/?symbol=TWSE:${signal.symbol}` }]]
  };
  return sendHTML(html, markup);
};

export const sendExitAlert = (alert, position) => {
  const emojis = { STOP_LOSS: '🚨', TAKE_PROFIT: '🎉', MA5_BREAK: '⚠️', NEWS_AI_EXIT: '🏃' };
  const html = `${emojis[alert.alert_type] || '🔔'} <b>出場警報</b>
股票：<code>${alert.symbol}</code> ${position.name}
類型：${alert.alert_type}
觸發價格：${alert.trigger_price}
原因：${alert.trigger_reason}

<b>AI 建議：</b>
<pre>${alert.ai_analysis}</pre>`;
  
  return sendHTML(html);
};

export const sendDailySummary = (stats) => {
  const html = `📊 <b>每日總結</b>
總交易次數：${stats.totalTrades}
勝率：${stats.winRate.toFixed(2)}%
平均損益：${stats.avgProfitPct.toFixed(2)}%`;
  return sendHTML(html);
};

export const sendTestMessage = () => sendHTML('✅ <b>AI 台灣股市雷達系統測試連線成功！</b>');
""",
    "src/scheduler/radarJob.js": """import cron from 'node-cron';
import { RADAR_SCAN_INTERVAL_MIN, isMarketOpen } from '../config/index.js';
import { scan as scanBlueChip } from '../services/radar/blueChipScanner.js';
import { scan as scanMomentum } from '../services/radar/momentumScanner.js';
import { addRadarSignal } from '../db/database.js';
import { sendEntrySignal } from '../services/notify/telegram.js';
import { logger } from '../utils/logger.js';

export const runBlueChipScan = async () => {
  const signals = await scanBlueChip();
  for (const s of signals) {
    addRadarSignal(s);
    sendEntrySignal(s);
  }
};

export const runMomentumScan = async () => {
  const signals = await scanMomentum();
  for (const s of signals) {
    addRadarSignal(s);
    sendEntrySignal(s);
  }
};

export const runPreMarketScan = async () => {
  logger.info('Scheduler', '執行盤前新聞掃描...');
  await runBlueChipScan();
};

export const runPostMarketSummary = async () => {
  logger.info('Scheduler', '執行盤後統計總結...');
};

export const startRadarJobs = () => {
  // 盤中定期掃描
  cron.schedule(`*/${RADAR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) {
      runBlueChipScan();
      runMomentumScan();
    }
  });
  
  // 盤前 (08:30)
  cron.schedule('30 8 * * 1-5', runPreMarketScan);
  // 盤後 (14:00)
  cron.schedule('0 14 * * 1-5', runPostMarketSummary);
};
""",
    "src/scheduler/monitorJob.js": """import cron from 'node-cron';
import { MONITOR_SCAN_INTERVAL_MIN, NEWS_SCAN_INTERVAL_MIN, isMarketOpen } from '../config/index.js';
import { getActivePositions } from '../db/database.js';
import { evaluatePosition } from '../services/monitor/exitEngine.js';
import { connect, disconnect } from '../services/fugle/streaming.js';
import { logger } from '../utils/logger.js';

export const runPriceCheck = async () => {
  const positions = getActivePositions();
  for (const p of positions) {
    await evaluatePosition(p);
  }
};

export const runNewsCheck = async () => {
  // 新聞檢查
};

export const startStreaming = () => connect();
export const stopStreaming = () => disconnect();

export const startMonitorJobs = () => {
  cron.schedule(`*/${MONITOR_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) runPriceCheck();
  });

  cron.schedule(`*/${NEWS_SCAN_INTERVAL_MIN} * * * 1-5`, () => {
    if (isMarketOpen()) runNewsCheck();
  });

  cron.schedule('0 9 * * 1-5', startStreaming);
  cron.schedule('35 13 * * 1-5', stopStreaming);
};
""",
    "src/scheduler/index.js": """import { startRadarJobs } from './radarJob.js';
import { startMonitorJobs } from './monitorJob.js';
import { logger } from '../utils/logger.js';

export const startAllJobs = () => {
  startRadarJobs();
  startMonitorJobs();
  logger.info('Scheduler', '所有排程任務已啟動');
};

export const stopAllJobs = () => {
  logger.info('Scheduler', '所有排程任務已停止');
};
""",
    "src/api/radarRoutes.js": """import { Router } from 'express';
import { getRadarSignals } from '../db/database.js';
import { runBlueChipScan, runMomentumScan } from '../scheduler/radarJob.js';

const router = Router();

router.get('/signals', (req, res) => {
  const type = req.query.type;
  let signals = getRadarSignals();
  if (type) signals = signals.filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.get('/signals/:type', (req, res) => {
  const type = req.params.type;
  const signals = getRadarSignals().filter(s => s.signal_type === type.toUpperCase());
  res.json({ success: true, data: signals });
});

router.post('/scan', async (req, res) => {
  const { type } = req.body;
  if (type === 'blue_chip' || type === 'all') await runBlueChipScan();
  if (type === 'momentum' || type === 'all') await runMomentumScan();
  res.json({ success: true, message: 'Scan triggered' });
});

export default router;
""",
    "src/api/monitorRoutes.js": """import { Router } from 'express';
import { getActivePositions, addPosition, updatePosition, exitPosition, getExitAlerts } from '../db/database.js';

const router = Router();

router.get('/positions', (req, res) => {
  res.json({ success: true, data: getActivePositions() });
});

router.post('/positions', (req, res) => {
  const data = req.body;
  const result = addPosition(data);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.patch('/positions/:id', (req, res) => {
  updatePosition(req.params.id, req.body);
  res.json({ success: true });
});

router.post('/positions/:id/exit', (req, res) => {
  exitPosition(req.params.id, req.body);
  res.json({ success: true });
});

router.get('/alerts', (req, res) => {
  res.json({ success: true, data: getExitAlerts() });
});

export default router;
""",
    "src/api/historyRoutes.js": """import { Router } from 'express';
import { getTradeHistory, getTradeStats } from '../db/database.js';

const router = Router();

router.get('/trades', (req, res) => {
  res.json({ success: true, data: getTradeHistory() });
});

router.get('/stats', (req, res) => {
  res.json({ success: true, data: getTradeStats() });
});

export default router;
""",
    "src/api/settingsRoutes.js": """import { Router } from 'express';
import { getSetting, setSetting } from '../db/database.js';

const router = Router();

router.get('/', (req, res) => {
  // Mock fallback
  res.json({ success: true, data: {} });
});

router.put('/', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    setSetting(key, String(value));
  }
  res.json({ success: true });
});

export default router;
""",
    "src/api/routes.js": """import { Router } from 'express';
import radarRoutes from './radarRoutes.js';
import monitorRoutes from './monitorRoutes.js';
import historyRoutes from './historyRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import { getQuote } from '../services/fugle/marketData.js';

const router = Router();

router.use('/radar', radarRoutes);
router.use('/monitor', monitorRoutes);
router.use('/history', historyRoutes);
router.use('/settings', settingsRoutes);

router.get('/market/quote/:symbol', async (req, res) => {
  const quote = await getQuote(req.params.symbol);
  res.json({ success: !!quote, data: quote });
});

router.get('/health', (req, res) => res.json({ status: 'OK' }));

export default router;
""",
    "src/index.js": """import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { PORT } from './config/index.js';
import { initDatabase } from './db/database.js';
import apiRoutes from './api/routes.js';
import { startAllJobs } from './scheduler/index.js';
import { streamEmitter } from './services/fugle/streaming.js';
import { logger } from './utils/logger.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Init DB
initDatabase();

// Mount Routes
app.use('/api', apiRoutes);

// WebSocket Setup
wss.on('connection', (ws) => {
  logger.info('Server', '前端 WebSocket 已連接');
  ws.on('message', (msg) => {
    // 處理訂閱等邏輯
  });
});

streamEmitter.on('price-update', (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({ type: 'price_update', data }));
    }
  });
});

// Start Scheduler
startAllJobs();

server.listen(PORT, () => {
  logger.info('Server', `API 與 WebSocket 伺服器啟動於 port ${PORT}`);
});

process.on('SIGINT', () => {
  logger.info('Server', '正在關閉伺服器...');
  process.exit(0);
});
""",
    ".env.example": """PORT=3001
DB_PATH=./data/radar.db

# API Keys
FUGLE_API_KEY=your_fugle_key
GEMINI_API_KEY=your_gemini_key
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id

# Trading Config
STOP_LOSS_PCT=-7.0
TAKE_PROFIT_PCT=15.0
MA5_EXIT=true
VOLUME_RATIO_THRESHOLD=2.5
BLUE_CHIP_TOP_N=50

# Scheduler (minutes)
RADAR_SCAN_INTERVAL_MIN=30
MONITOR_SCAN_INTERVAL_MIN=3
NEWS_SCAN_INTERVAL_MIN=10

# Market Hours
MARKET_OPEN=09:00
MARKET_CLOSE=13:30
"""
}

def create_files():
    for rel_path, content in FILES.items():
        full_path = os.path.join(BASE_DIR, rel_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Created: {rel_path}")

if __name__ == "__main__":
    create_files()
    print("All backend files created successfully.")
