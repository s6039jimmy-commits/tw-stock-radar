CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  entry_price REAL NOT NULL,
  entry_date TEXT NOT NULL,
  entry_reason TEXT,
  ai_stars INTEGER,
  shares INTEGER DEFAULT 1000,
  stop_loss_pct REAL DEFAULT -7.0,
  take_profit_pct REAL DEFAULT 15.0,
  ma5_exit INTEGER DEFAULT 1,
  ma_exit_period INTEGER DEFAULT 5,
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
