import { useState, useEffect } from 'react';
import { Search, Loader2, RefreshCw } from 'lucide-react';
import RadarSignalCard from '../dashboard/RadarSignalCard';

export default function BlueChipRadar() {
  const [isScanning, setIsScanning] = useState(false);
  const [signals, setSignals] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/radar/signals?type=blue_chip');
      const data = await res.json();
      if (data.success && data.data) {
        setSignals(data.data.filter(s => s.signal_type === 'BLUE_CHIP'));
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch blue chip signals', e);
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
        body: JSON.stringify({ type: 'blue_chip' })
      });
      // 等 90 秒後自動更新結果（AI 分析需要時間）
      setTimeout(async () => {
        await fetchSignals();
        setIsScanning(false);
      }, 90000);
      // 30 秒時先更新一次
      setTimeout(fetchSignals, 30000);
      // 60 秒時再更新一次
      setTimeout(fetchSignals, 60000);
    } catch (e) {
      console.error(e);
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--accent-blue)]">
            大型權值股雷達
          </h3>
          <p className="text-sm text-secondary mt-1">專注於基本面穩健、流動性高的大型股</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchSignals} className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
            <RefreshCw size={13} /> 更新
          </button>
          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span>{isScanning ? 'AI 分析中 (約90秒)...' : '手動掃描'}</span>
          </button>
        </div>
      </div>

      {isScanning && signals.length === 0 ? (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted gap-4">
          <Loader2 size={40} className="animate-spin text-[var(--accent-blue)]" />
          <p className="text-center">AI 正在深度分析台積電、鴻海、聯發科...<br/><span className="text-xs opacity-60">約需 90 秒，請稍候</span></p>
        </div>
      ) : signals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {signals.map(signal => (
            <RadarSignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-4 relative">
            <Search size={24} className="text-gray-500" />
          </div>
          <p>目前沒有符合條件的大型股訊號</p>
          <p className="text-xs mt-2 opacity-60">按「手動掃描」立刻分析台積電等前5大龍頭</p>
        </div>
      )}
    </div>
  );
}
