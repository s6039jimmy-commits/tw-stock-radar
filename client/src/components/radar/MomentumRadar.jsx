import { useState, useEffect } from 'react';
import { Zap, Loader2, RefreshCw } from 'lucide-react';
import RadarSignalCard from '../dashboard/RadarSignalCard';

export default function MomentumRadar() {
  const [isScanning, setIsScanning] = useState(false);
  const [signals, setSignals] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/radar/signals?type=momentum');
      const data = await res.json();
      if (data.success && data.data) {
        setSignals(data.data.filter(s => s.signal_type === 'MOMENTUM'));
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch momentum signals', e);
    }
  };

  useEffect(() => {
    fetchSignals();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      // 觸發後端掃描
      await fetch('/api/radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'momentum' })
      });
      // 每 30 秒輪詢一次結果，共 3 次 (最長 90 秒)
      setTimeout(fetchSignals, 30000);
      setTimeout(fetchSignals, 60000);
      setTimeout(async () => {
        await fetchSignals();
        setIsScanning(false);
      }, 90000);
    } catch (e) {
      console.error(e);
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--accent-purple)]">
            <Zap size={20} className="text-[var(--accent-purple)]" />
            強勢動能股雷達
          </h3>
          <p className="text-sm text-secondary mt-1">鎖定爆量長紅、突破區間的飆股</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSignals} className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
            <RefreshCw size={13} /> 更新
          </button>
          <button
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, var(--accent-purple), #ec4899)' }}
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            <span>{isScanning ? 'AI 分析中 (約90秒)...' : '手動掃描'}</span>
          </button>
        </div>
      </div>

      {isScanning && signals.length === 0 ? (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted gap-4">
          <Loader2 size={40} className="animate-spin text-[var(--accent-purple)]" />
          <p className="text-center">AI 正在全市場掃描爆量飆股...<br /><span className="text-xs opacity-60">約需 90 秒，請稍候，有結果會自動顯示</span></p>
        </div>
      ) : signals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {signals.map(signal => (
            <RadarSignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-4">
            <Zap size={24} className="text-gray-500" />
          </div>
          <p>目前沒有符合條件的動能股訊號</p>
          <p className="text-xs mt-2 opacity-60">按「手動掃描」觸發 AI 全市場搜索</p>
        </div>
      )}
    </div>
  );
}
