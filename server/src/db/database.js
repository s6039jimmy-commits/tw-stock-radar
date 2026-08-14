import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { DB_PATH, SUPABASE_URL, SUPABASE_SERVICE_KEY } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbType = 'sqlite'; // 'sqlite' | 'supabase'
let sqliteDb = null;
let supabase = null;

export const initDatabase = async () => {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    dbType = 'supabase';
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    logger.info('Database', '連線至 Supabase 雲端資料庫');
  } else {
    dbType = 'sqlite';
    try {
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const SQL = await initSqlJs();
      if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        sqliteDb = new SQL.Database(buffer);
      } else {
        sqliteDb = new SQL.Database();
      }
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
      sqliteDb.run(schema);
      setInterval(() => saveDatabase(), 30000);
      logger.info('Database', '連線至本地 SQLite 資料庫');
    } catch (e) {
      logger.error('Database', 'SQLite 初始化失敗', e);
      throw e;
    }
  }
};

export const saveDatabase = () => {
  if (dbType === 'sqlite' && sqliteDb) {
    try {
      const data = sqliteDb.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
      logger.error('Database', '儲存 SQLite 失敗', e);
    }
  }
};

// ── 通用查詢封裝 ──

const runQuery = async (sql, params = []) => {
  if (dbType === 'sqlite') {
    sqliteDb.run(sql, params);
    saveDatabase();
    const result = sqliteDb.exec("SELECT last_insert_rowid() as id");
    return { lastInsertRowid: result.length > 0 ? result[0].values[0][0] : null };
  } else {
    throw new Error('Supabase 不支援 runQuery');
  }
};

const getAll = async (sql, params = []) => {
  if (dbType === 'sqlite') {
    const result = sqliteDb.exec(sql, params);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } else {
    throw new Error('Supabase 不支援 getAll');
  }
};

const getOne = async (sql, params = []) => {
  const rows = await getAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
};

// ============ 倉位操作 ============

export const addPosition = async (data) => {
  if (dbType === 'supabase') {
    const { error } = await supabase.from('positions').insert([data]);
    if (error) logger.error('Database', 'addPosition Error', error);
  } else {
    await runQuery(`
      INSERT INTO positions (symbol, name, entry_price, entry_date, entry_reason, ai_stars, stop_loss_pct, take_profit_pct, ma5_exit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.symbol, data.name, data.entry_price, data.entry_date, data.entry_reason || null,
        data.ai_stars || null, data.stop_loss_pct || -7.0, data.take_profit_pct || 15.0, data.ma5_exit ?? 1]);
  }
};

export const getActivePositions = async () => {
  if (dbType === 'supabase') {
    const { data, error } = await supabase.from('positions').select('*').eq('status', 'MONITORING').order('created_at', { ascending: false });
    return data || [];
  } else {
    return await getAll("SELECT * FROM positions WHERE status = 'MONITORING' ORDER BY created_at DESC");
  }
};

export const getPositionById = async (id) => {
  if (dbType === 'supabase') {
    const { data } = await supabase.from('positions').select('*').eq('id', id).single();
    return data;
  } else {
    return await getOne("SELECT * FROM positions WHERE id = ?", [id]);
  }
};

export const updatePosition = async (id, data) => {
  if (dbType === 'supabase') {
    await supabase.from('positions').update(data).eq('id', id);
  } else {
    const fields = Object.keys(data);
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f]);
    await runQuery(`UPDATE positions SET ${sets}, updated_at = datetime('now','localtime') WHERE id = ?`, [...values, id]);
  }
};

export const exitPosition = async (id, exitData) => {
  if (dbType === 'supabase') {
    await supabase.from('positions').update({
      status: 'EXITED',
      exit_price: exitData.exit_price,
      exit_date: exitData.exit_date,
      exit_reason: exitData.exit_reason
    }).eq('id', id);
  } else {
    await runQuery(`
      UPDATE positions 
      SET status = 'EXITED', exit_price = ?, exit_date = ?, exit_reason = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `, [exitData.exit_price, exitData.exit_date, exitData.exit_reason, id]);
  }
};

// ============ 雷達訊號 ============

export const addRadarSignal = async (data) => {
  if (dbType === 'supabase') {
    await supabase.from('radar_signals').insert([data]);
  } else {
    await runQuery(`
      INSERT INTO radar_signals (symbol, name, signal_type, ai_stars, ai_sentiment, ai_reasoning, news_headline, current_price, volume_ratio)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.symbol, data.name, data.signal_type, data.ai_stars, data.ai_sentiment || null,
        data.ai_reasoning || null, data.news_headline || null, data.current_price || null, data.volume_ratio || null]);
  }
};

export const getRadarSignals = async (type = null, limit = 50) => {
  if (dbType === 'supabase') {
    let query = supabase.from('radar_signals').select('*').order('created_at', { ascending: false }).limit(limit);
    if (type) query = query.eq('signal_type', type);
    const { data } = await query;
    return data || [];
  } else {
    if (type) {
      return await getAll("SELECT * FROM radar_signals WHERE signal_type = ? ORDER BY created_at DESC LIMIT ?", [type, limit]);
    }
    return await getAll("SELECT * FROM radar_signals ORDER BY created_at DESC LIMIT ?", [limit]);
  }
};

// ============ 出場警報 ============

export const addExitAlert = async (data) => {
  if (dbType === 'supabase') {
    await supabase.from('exit_alerts').insert([data]);
  } else {
    await runQuery(`
      INSERT INTO exit_alerts (position_id, symbol, alert_type, trigger_price, trigger_reason, ai_analysis)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [data.position_id, data.symbol, data.alert_type, data.trigger_price || null,
        data.trigger_reason || null, data.ai_analysis || null]);
  }
};

export const getExitAlerts = async (limit = 50) => {
  if (dbType === 'supabase') {
    const { data } = await supabase.from('exit_alerts').select('*').order('created_at', { ascending: false }).limit(limit);
    return data || [];
  } else {
    return await getAll("SELECT * FROM exit_alerts ORDER BY created_at DESC LIMIT ?", [limit]);
  }
};

// ============ 系統設定 ============

export const getSetting = async (key, defaultValue = null) => {
  if (dbType === 'supabase') {
    const { data } = await supabase.from('settings').select('value').eq('key', key).single();
    return data ? data.value : defaultValue;
  } else {
    const row = await getOne("SELECT value FROM settings WHERE key = ?", [key]);
    return row ? row.value : defaultValue;
  }
};

export const setSetting = async (key, value) => {
  if (dbType === 'supabase') {
    await supabase.from('settings').upsert({ key, value });
  } else {
    await runQuery(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now','localtime')
    `, [key, value]);
  }
};

// ============ 交易歷史 ============

export const getTradeHistory = async (limit = 100) => {
  if (dbType === 'supabase') {
    const { data } = await supabase.from('positions').select('*').eq('status', 'EXITED').order('exit_date', { ascending: false }).limit(limit);
    return data || [];
  } else {
    return await getAll("SELECT * FROM positions WHERE status = 'EXITED' ORDER BY exit_date DESC LIMIT ?", [limit]);
  }
};

export const getTradeStats = async () => {
  let closed = [];
  if (dbType === 'supabase') {
    const { data } = await supabase.from('positions').select('entry_price, exit_price').eq('status', 'EXITED');
    closed = data || [];
  } else {
    closed = await getAll("SELECT entry_price, exit_price FROM positions WHERE status = 'EXITED'");
  }

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
