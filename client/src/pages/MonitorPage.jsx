import { useState, useEffect } from 'react';
import WatchList from '../components/monitor/WatchList';
import PositionCard from '../components/monitor/PositionCard';
import ExitAlertPanel from '../components/monitor/ExitAlertPanel';
import { Plus, DollarSign } from 'lucide-react';
import { formatPrice } from '../utils/formatters';

export default function MonitorPage() {
  const [positions, setPositions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  useEffect(() => {
    const fetchMonitorData = async () => {
      try {
        const [positionsRes, alertsRes] = await Promise.all([
          fetch('/api/monitor/positions').then(res => res.json()).catch(() => ({ success: false, data: [] })),
          fetch('/api/monitor/alerts').then(res => res.json()).catch(() => ({ success: false, data: [] }))
        ]);
        if (positionsRes?.success) setPositions(positionsRes.data || []);
        if (alertsRes?.success) setAlerts(alertsRes.data || []);
      } catch (e) {
        console.error('Failed to fetch monitor data', e);
      }
    };
    fetchMonitorData();
  }, []);

  const totalPnl = positions.reduce((acc, pos) => acc + (pos.current_price - pos.entry_price), 0);
  const pnlClass = totalPnl > 0 ? 'text-[var(--color-up)]' : totalPnl < 0 ? 'text-[var(--color-down)]' : '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <div className="card-glass py-3 px-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-[var(--accent-blue)]">
              <DollarSign size={20} />
            </div>
            <div>
              <div className="text-xs text-secondary">總未實現損益</div>
              <div className={`text-xl font-bold font-mono ${pnlClass}`}>
                {totalPnl > 0 ? '+' : ''}{formatPrice(Math.abs(totalPnl))}
              </div>
            </div>
          </div>
        </div>
        
        <button className="btn btn-primary">
          <Plus size={16} />
          <span>新增持倉</span>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 flex flex-col gap-6">
          <WatchList positions={positions} />
          {positions.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PositionCard position={positions[0]} />
              {positions[1] && <PositionCard position={positions[1]} />}
            </div>
          )}
        </div>
        
        <div className="h-[600px]">
          <ExitAlertPanel alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
