import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, Send, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [showFugleKey, setShowFugleKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);

  const [form, setForm] = useState({
    FUGLE_API_KEY: '',
    GEMINI_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    AI_DANGER_LEVEL_THRESHOLD: '4',
    PRE_MARKET_SCAN_TIME: '08:45',
    VOLUME_RATIO_THRESHOLD: '2.5'
  });

  const [statusMsg, setStatusMsg] = useState(null);
  const [testingTg, setTestingTg] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setForm(prev => ({ ...prev, ...data.data }));
        }
      })
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: '✅ 設定已成功儲存！' });
      } else {
        setStatusMsg({ type: 'error', text: '儲存失敗' });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: '連線錯誤: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTg(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/settings/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: form.TELEGRAM_BOT_TOKEN,
          chatId: form.TELEGRAM_CHAT_ID
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: '🎉 ' + data.message });
      } else {
        setStatusMsg({ type: 'error', text: '❌ ' + data.message });
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: '測試失敗: ' + e.message });
    } finally {
      setTestingTg(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8 pb-12">
      {statusMsg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
          statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Telegram 機器人推播設定 */}
      <div className="card-glass flex flex-col gap-6">
        <div className="flex justify-between items-center border-b border-[var(--card-border)] pb-3">
          <div>
            <h3 className="text-lg font-bold">📲 Telegram 即時警報推播設定</h3>
            <p className="text-xs text-muted mt-1">免費設定 Telegram Bot，將 4 星以上進場雷達與停損警報即時發送至手機</p>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">Telegram Bot Token</label>
            <div className="relative">
              <input 
                type={showTgToken ? "text" : "password"}
                name="TELEGRAM_BOT_TOKEN"
                className="input pr-10 font-mono text-sm" 
                placeholder="例如: 7123456789:AAF_xYzExampleTokenKey..."
                value={form.TELEGRAM_BOT_TOKEN || ''}
                onChange={handleChange}
              />
              <button 
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                onClick={() => setShowTgToken(!showTgToken)}
              >
                {showTgToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted">至 Telegram 搜尋 <code>@BotFather</code> 發送 <code>/newbot</code> 建立機器人後取得</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">Telegram Chat ID (你的聊天室識別碼)</label>
            <input 
              type="text" 
              name="TELEGRAM_CHAT_ID"
              className="input font-mono text-sm" 
              placeholder="例如: 123456789"
              value={form.TELEGRAM_CHAT_ID || ''}
              onChange={handleChange}
            />
            <p className="text-xs text-muted">至 Telegram 搜尋 <code>@userinfobot</code> 傳送任意訊息即可取得你的個人 Chat ID</p>
          </div>

          <div className="flex justify-start">
            <button 
              type="button"
              className="btn btn-secondary text-sm py-2 px-4 flex items-center gap-2"
              onClick={handleTestTelegram}
              disabled={testingTg || !form.TELEGRAM_BOT_TOKEN || !form.TELEGRAM_CHAT_ID}
            >
              {testingTg ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />}
              <span>{testingTg ? '發送中...' : '發送測試推播訊息'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* API 金鑰設定 */}
      <div className="card-glass flex flex-col gap-6">
        <h3 className="text-lg font-bold border-b border-[var(--card-border)] pb-3">🔑 股市與 AI 金鑰設定</h3>
        
        <div className="grid gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">富果 (Fugle) API Key</label>
            <div className="relative">
              <input 
                type={showFugleKey ? "text" : "password"} 
                name="FUGLE_API_KEY"
                className="input pr-10 font-mono text-sm" 
                value={form.FUGLE_API_KEY || ''}
                onChange={handleChange}
              />
              <button 
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                onClick={() => setShowFugleKey(!showFugleKey)}
              >
                {showFugleKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted">用於獲取台股即時報價與市場快照 (已設定與連線成功)</p>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">Google Gemini API Key</label>
            <div className="relative">
              <input 
                type={showGeminiKey ? "text" : "password"} 
                name="GEMINI_API_KEY"
                className="input pr-10 font-mono text-sm" 
                value={form.GEMINI_API_KEY || ''}
                onChange={handleChange}
              />
              <button 
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
              >
                {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted">Gemini 2.5 Flash 結構化 JSON AI 模型 (已設定與連線成功)</p>
          </div>
        </div>
      </div>

      {/* 交易與風險控管參數 */}
      <div className="card-glass flex flex-col gap-6">
        <h3 className="text-lg font-bold border-b border-[var(--card-border)] pb-3">⚙️ 交易紀律與風向門檻設定</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">AI 突發利空危險門檻</label>
            <select 
              name="AI_DANGER_LEVEL_THRESHOLD"
              className="input font-mono" 
              value={form.AI_DANGER_LEVEL_THRESHOLD || '4'} 
              onChange={handleChange}
            >
              <option value="3">3 (中度危險)</option>
              <option value="4">4 (高度危險 - 預設)</option>
              <option value="5">5 (極度危險)</option>
            </select>
            <p className="text-xs text-muted">危險等級達此設定即觸發市價賣出警報</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">盤前新聞掃描時間</label>
            <select 
              name="PRE_MARKET_SCAN_TIME"
              className="input font-mono" 
              value={form.PRE_MARKET_SCAN_TIME || '08:45'} 
              onChange={handleChange}
            >
              <option value="08:30">08:30 (試撮開始)</option>
              <option value="08:45">08:45 (試撮後段 - 預設)</option>
              <option value="08:55">08:55 (開盤前 5 分鐘)</option>
            </select>
            <p className="text-xs text-muted">系統將於此時間抓取過夜新聞並發送預警</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-secondary font-medium">飆股爆量門檻 (倍)</label>
            <input 
              type="number" 
              name="VOLUME_RATIO_THRESHOLD"
              className="input font-mono" 
              value={form.VOLUME_RATIO_THRESHOLD || '2.5'} 
              onChange={handleChange}
              step="0.1"
            />
            <p className="text-xs text-muted">當日成交量 vs 20日均量倍數 (預設 2.5倍)</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button 
          type="button"
          className="btn btn-primary px-8 py-3 flex items-center gap-2 text-base font-bold shadow-lg"
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={18} />
          <span>{saving ? '儲存中...' : '儲存所有設定'}</span>
        </button>
      </div>
    </div>
  );
}
