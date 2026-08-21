import dotenv from 'dotenv';
dotenv.config();

// 系統設定
export const PORT = process.env.PORT || 3001;
export const DB_PATH = process.env.DB_PATH || './data/radar.db';

// API 金鑰
export const FUGLE_API_KEY = process.env.FUGLE_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// 交易參數 (預設值)
export const AI_DANGER_LEVEL_THRESHOLD = parseInt(process.env.AI_DANGER_LEVEL_THRESHOLD || '4');
export const PRE_MARKET_SCAN_TIME = process.env.PRE_MARKET_SCAN_TIME || '08:45';
export const MA5_EXIT = process.env.MA5_EXIT === 'true' || true;
export const VOLUME_RATIO_THRESHOLD = parseFloat(process.env.VOLUME_RATIO_THRESHOLD || '2.5');
export const BLUE_CHIP_TOP_N = parseInt(process.env.BLUE_CHIP_TOP_N || '50');

// 掃描間隔 (分鐘)
export const RADAR_SCAN_INTERVAL_MIN = parseInt(process.env.RADAR_SCAN_INTERVAL_MIN || '3');
export const MONITOR_SCAN_INTERVAL_MIN = parseInt(process.env.MONITOR_SCAN_INTERVAL_MIN || '1');
export const NEWS_SCAN_INTERVAL_MIN = parseInt(process.env.NEWS_SCAN_INTERVAL_MIN || '3');

// 交易時間
export const MARKET_OPEN = process.env.MARKET_OPEN || '09:00';
export const MARKET_CLOSE = process.env.MARKET_CLOSE || '13:30';
