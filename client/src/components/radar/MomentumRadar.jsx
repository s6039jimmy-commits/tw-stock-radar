import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import RadarSignalCard from '../dashboard/RadarSignalCard';

export default function MomentumRadar({ signals = [] }) {
  const [isScanning, setIsScanning] = useState(false);
  const momentumSignals = signals.filter(s => s.type === 'MOMENTUM');

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000); // Mock scan
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
        <button 
          className="btn btn-primary"
          style={{ background: 'linear-gradient(135deg, var(--accent-purple), #ec4899)' }}
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          <span>{isScanning ? '掃描中...' : '手動掃描'}</span>
        </button>
      </div>

      {isScanning ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-glass h-64 skeleton rounded-xl"></div>
          ))}
        </div>
      ) : momentumSignals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {momentumSignals.map(signal => (
            <RadarSignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-4 relative">
            <div className="absolute inset-0 border-t-2 border-[var(--accent-purple)] rounded-full animate-spin"></div>
            <Zap size={24} className="text-gray-500" />
          </div>
          <p>目前沒有符合條件的動能股訊號</p>
        </div>
      )}
    </div>
  );
}
