import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DB_PATH } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db;

// 初始化資料庫 (使用 sql.js — 純 JavaScript SQLite)
export const initDatabase = async () => {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // 若資料庫檔案已存在，載入它；否則建立新的
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    // 執行 Schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.run(schema);

    // 定期自動儲存到磁碟
    setInterval(() => saveDatabase(), 30000);

    logger.info('Database', '資料庫初始化成功');
  } catch (error) {
    logger.error('Database', '資料庫初始化失敗', error);
    throw error;
  }
};

// 將資料庫寫入磁碟
export const saveDatabase = () => {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (error) {
    logger.error('Database', '資料庫儲存失敗', error);
  }
};

export const getDb = () => db;

// 通用查詢 helper
const runQuery = (sql, params = []) => {
  try {
    db.run(sql, params);
    saveDatabase();
    // sql.js 不直接回傳 lastInsertRowId，需額外查詢
    const result = db.exec("SELECT last_insert_rowid() as id");
    return { lastInsertRowid: result.length > 0 ? result[0].values[0][0] : null };
  } catch (error) {
    logger.error('Database', `查詢失敗: ${sql}`, error);
    throw error;
  }
};

const getAll = (sql, params = []) => {
  try {
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (error) {
    logger.error('Database', `查詢失敗: ${sql}`, error);
    return [];
  }
};

const getOne = (sql, params = []) => {
  const rows = getAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
};

// ============ 倉位操作 ============

export const addPosition = (data) => {
  return runQuery(`
    INSERT INTO positions (symbol, name, entry_price, entry_date, entry_reason, ai_stars, stop_loss_pct, take_profit_pct, ma5_exit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.symbol, data.name, data.entry_price, data.entry_date, data.entry_reason || null,
      data.ai_stars || null, data.stop_loss_pct || -7.0, data.take_profit_pct || 15.0, data.ma5_exit ?? 1]);
};

export const getActivePositions = () => {
  return getAll("SELECT * FROM positions WHERE status = 'MONITORING' ORDER BY created_at DESC");
};

export const getPositionById = (id) => {
  return getOne("SELECT * FROM positions WHERE id = ?", [id]);
};

export const updatePosition = (id, data) => {
  const fields = Object.keys(data);
  const sets = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => data[f]);
  return runQuery(`UPDATE positions SET ${sets}, updated_at = datetime('now','localtime') WHERE id = ?`, [...values, id]);
};

export const exitPosition = (id, exitData) => {
  return runQuery(`
    UPDATE positions 
    SET status = 'EXITED', exit_price = ?, exit_date = ?, exit_reason = ?, updated_at = datetime('now','localtime')
    WHERE id = ?
  `, [exitData.exit_price, exitData.exit_date, exitData.exit_reason, id]);
};

// ============ 雷達訊號 ============

export const addRadarSignal = (data) => {
  return runQuery(`
    INSERT INTO radar_signals (symbol, name, signal_type, ai_stars, ai_sentiment, ai_reasoning, news_headline, current_price, volume_ratio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.symbol, data.name, data.signal_type, data.ai_stars, data.ai_sentiment || null,
      data.ai_reasoning || null, data.news_headline || null, data.current_price || null, data.volume_ratio || null]);
};

export const getRadarSignals = (type = null, limit = 50) => {
  if (type) {
    return getAll("SELECT * FROM radar_signals WHERE signal_type = ? ORDER BY created_at DESC LIMIT ?", [type, limit]);
  }
  return getAll("SELECT * FROM radar_signals ORDER BY created_at DESC LIMIT ?", [limit]);
};

// ============ 出場警報 ============

export const addExitAlert = (data) => {
  return runQuery(`
    INSERT INTO exit_alerts (position_id, symbol, alert_type, trigger_price, trigger_reason, ai_analysis)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [data.position_id, data.symbol, data.alert_type, data.trigger_price || null,
      data.trigger_reason || null, data.ai_analysis || null]);
};

export const getExitAlerts = (limit = 50) => {
  return getAll("SELECT * FROM exit_alerts ORDER BY created_at DESC LIMIT ?", [limit]);
};

// ============ 系統設定 ============

export const getSetting = (key, defaultValue = null) => {
  const row = getOne("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : defaultValue;
};

export const setSetting = (key, value) => {
  return runQuery(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
  `, [key, value]);
};

// ============ 交易歷史 ============

export const getTradeHistory = (limit = 100) => {
  return getAll("SELECT * FROM positions WHERE status = 'EXITED' ORDER BY exit_date DESC LIMIT ?", [limit]);
};

export const getTradeStats = () => {
  const closed = getAll("SELECT entry_price, exit_price FROM positions WHERE status = 'EXITED'");
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
    winRate: parseFloat(((wins / closed.length) * 100).toFixed(1)),
    avgProfitPct: parseFloat((totalProfitPct / closed.length).toFixed(2))
  };
};
