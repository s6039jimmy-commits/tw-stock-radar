import { useState, useEffect } from 'react';
import { Zap, Search, Loader2, RefreshCw, Star } from 'lucide-react';
import RadarSignalCard from '../components/dashboard/RadarSignalCard';

export default function RadarPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [signals, setSignals] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchSignals = async () => {
    try {
      const res = await fetch('/api/radar/signals');
      const data = await res.json();
      if (data.success && data.data) {
        // 去除重複的股票代號，只保留第一筆 (因為後端通常依時間排序，所以保留最新的一筆)
        const uniqueSignals = [];
        const seenSymbols = new Set();
        
        for (const signal of data.data) {
          if (!seenSymbols.has(signal.symbol)) {
            seenSymbols.add(signal.symbol);
            uniqueSignals.push(signal);
          }
        }

        // 依 AI 星數排序，越高星排越前面
        const sorted = uniqueSignals.sort((a, b) => (b.ai_stars || 0) - (a.ai_stars || 0));
        setSignals(sorted);
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch signals', e);
    }
  };

  useEffect(() => {
    fetchSignals();
    const intervalId = setInterval(fetchSignals, 5000);
    return () => clearInterval(intervalId);
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      // 同時觸發大型股 + 動能飆股雷達
      await fetch('/api/radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' })
      });
      // 30 / 60 / 90 秒各輪詢一次
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

  const blueChipSignals = signals.filter(s => s.signal_type === 'BLUE_CHIP');
  const momentumSignals = signals.filter(s => s.signal_type === 'MOMENTUM');

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="text-yellow-400" size={24} />
            AI 全市場雷達
          </h2>
          <p className="text-sm text-secondary mt-1">
            同時掃描大型權值股 + 全市場爆量飆股，AI 深度評分，5星訊號直接推 Telegram
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-xs text-muted font-mono">
              最後更新 {lastUpdate.toLocaleTimeString('zh-TW')}
            </span>
          )}
          <button onClick={fetchSignals} className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
            <RefreshCw size={13} />
            更新
          </button>
          <button
            className="btn btn-primary flex items-center gap-2 whitespace-nowrap"
            onClick={handleScan}
            disabled={isScanning}
          >
            {isScanning
              ? <><Loader2 size={16} className="animate-spin" /><span>掃描中...</span></>
              : <><Search size={16} /><span>立即掃描</span></>
            }
          </button>
        </div>
      </div>

      {/* 掃描中動畫 */}
      {isScanning && signals.length === 0 && (
        <div className="card-glass py-24 flex flex-col items-center justify-center text-muted gap-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-4 border-[var(--accent-blue)] border-t-transparent rounded-full animate-spin" />
            <div className="absolute inset-3 border-4 border-[var(--accent-purple)] border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse' }} />
            <Zap className="absolute inset-0 m-auto text-yellow-400" size={24} />
          </div>
          <p className="text-center text-base font-medium">AI 正在全市場掃描中...</p>
          <p className="text-xs opacity-60 text-center">同時分析台積電等五大龍頭 + 全市場爆量飆股<br />約需 90 秒，有結果將自動顯示</p>
        </div>
      )}

      {/* 大型權值股區塊 */}
      {(blueChipSignals.length > 0 || !isScanning) && (
        <section>
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Search size={18} className="text-[var(--accent-blue)]" />
            大型權值股雷達
            {blueChipSignals.length > 0 && (
              <span className="text-xs bg-blue-500/20 text-[var(--accent-blue)] px-2 py-0.5 rounded-full font-normal">
                {blueChipSignals.length} 筆
              </span>
            )}
          </h3>
          {blueChipSignals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blueChipSignals.map(signal => (
                <RadarSignalCard key={signal.id || signal.symbol} signal={signal} />
              ))}
            </div>
          ) : !isScanning && (
            <div className="card-glass py-10 flex flex-col items-center text-muted text-sm">
              <Search size={28} className="mb-3 opacity-40" />
              <p>尚無大型股訊號，按「手動觸發」立即分析</p>
            </div>
          )}
        </section>
      )}

      {/* 強勢動能飆股區塊 */}
      {(momentumSignals.length > 0 || !isScanning) && (
        <section>
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Zap size={18} className="text-[var(--accent-purple)]" />
            強勢動能飆股雷達
            {momentumSignals.length > 0 && (
              <span className="text-xs bg-purple-500/20 text-[var(--accent-purple)] px-2 py-0.5 rounded-full font-normal">
                {momentumSignals.length} 筆
              </span>
            )}
          </h3>
          {momentumSignals.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {momentumSignals.map(signal => (
                <RadarSignalCard key={signal.id || signal.symbol} signal={signal} />
              ))}
            </div>
          ) : !isScanning && (
            <div className="card-glass py-10 flex flex-col items-center text-muted text-sm">
              <Zap size={28} className="mb-3 opacity-40" />
              <p>尚無飆股訊號，按「手動觸發」立即全市場搜索</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
