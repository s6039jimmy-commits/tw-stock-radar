import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import RadarSignalCard from '../dashboard/RadarSignalCard';

export default function BlueChipRadar({ signals = [] }) {
  const [isScanning, setIsScanning] = useState(false);
  const blueChipSignals = signals.filter(s => s.type === 'BLUE_CHIP');

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 2000); // Mock scan
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
        <button 
          className="btn btn-primary"
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          <span>{isScanning ? '掃描中...' : '手動掃描'}</span>
        </button>
      </div>

      {isScanning ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="card-glass h-64 skeleton rounded-xl"></div>
          ))}
        </div>
      ) : blueChipSignals.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {blueChipSignals.map(signal => (
            <RadarSignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="card-glass py-20 flex flex-col items-center justify-center text-muted">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-gray-600 flex items-center justify-center mb-4 relative">
            <div className="absolute inset-0 border-t-2 border-[var(--accent-blue)] rounded-full animate-spin"></div>
            <Search size={24} className="text-gray-500" />
          </div>
          <p>目前沒有符合條件的大型股訊號</p>
        </div>
      )}
    </div>
  );
}
