import { useState, useEffect } from 'react';
import BlueChipRadar from '../components/radar/BlueChipRadar';
import MomentumRadar from '../components/radar/MomentumRadar';
import { formatTime } from '../utils/formatters';

export default function RadarPage() {
  const [activeTab, setActiveTab] = useState('BLUE_CHIP');
  const [signals, setSignals] = useState([]);
  const lastScanTime = new Date();

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/radar/signals');
        const data = await res.json();
        if (data.success && data.data) {
          setSignals(data.data);
        }
      } catch (e) {
        console.error('Failed to fetch radar signals', e);
      }
    };
    fetchSignals();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-4">
        <div className="flex gap-8">
          <button 
            className={`pb-4 px-2 text-lg font-bold transition-colors relative ${
              activeTab === 'BLUE_CHIP' ? 'text-[var(--accent-blue)]' : 'text-secondary hover:text-primary'
            }`}
            onClick={() => setActiveTab('BLUE_CHIP')}
          >
            大型股雷達
            {activeTab === 'BLUE_CHIP' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-blue)] shadow-[0_0_8px_var(--accent-blue)]"></div>
            )}
          </button>
          
          <button 
            className={`pb-4 px-2 text-lg font-bold transition-colors relative ${
              activeTab === 'MOMENTUM' ? 'text-[var(--accent-purple)]' : 'text-secondary hover:text-primary'
            }`}
            onClick={() => setActiveTab('MOMENTUM')}
          >
            強勢動能雷達
            {activeTab === 'MOMENTUM' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-purple)] shadow-[0_0_8px_var(--accent-purple)]"></div>
            )}
          </button>
        </div>
        
        <div className="text-sm text-muted font-mono">
          最後更新: {formatTime(lastScanTime)}
        </div>
      </div>
      
      <div className="mt-4">
        {activeTab === 'BLUE_CHIP' ? (
          <BlueChipRadar signals={signals} />
        ) : (
          <MomentumRadar signals={signals} />
        )}
      </div>
    </div>
  );
}
