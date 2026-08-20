import { useState, useEffect, useCallback } from 'react';
import WatchList from '../components/monitor/WatchList';
import PositionCard from '../components/monitor/PositionCard';
import ExitAlertPanel from '../components/monitor/ExitAlertPanel';
import { Plus, DollarSign, Activity, Trophy, RefreshCw } from 'lucide-react';
import { formatPrice } from '../utils/formatters';

export default function MonitorPage() {
  const [positions, setPositions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ winRate: 0 });
  
  const fetchMonitorData = useCallback(async () => {
    try {
      const [positionsRes, alertsRes, statsRes] = await Promise.all([
        fetch('/api/monitor/positions').then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch('/api/monitor/alerts').then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch('/api/history/stats').then(res => res.json()).catch(() => ({ success: false, data: { winRate: 0 } }))
      ]);
      if (positionsRes?.success) setPositions(positionsRes.data || []);
      if (alertsRes?.success) setAlerts(alertsRes.data || []);
      if (statsRes?.success) setStats(statsRes.data || { winRate: 0 });
    } catch (e) {
      console.error('Failed to fetch monitor data', e);
    }
  }, []);

  useEffect(() => {
    // 初次載入
    fetchMonitorData();
    
    // 設定每 5 秒自動更新一次報價
    const interval = setInterval(fetchMonitorData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalPnl = positions.reduce((acc, pos) => acc + (pos.current_price - pos.entry_price), 0);
  const pnlClass = totalPnl > 0 ? 'text-[var(--color-up)]' : totalPnl < 0 ? 'text-[var(--color-down)]' : '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-wrap gap-4 w-full md:w-auto">
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
          
          <div className="card-glass py-3 px-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-500">
              <Activity size={20} />
            </div>
            <div>
              <div className="text-xs text-secondary">監控中部位</div>
              <div className="text-xl font-bold font-mono">
                {positions.length} <span className="text-sm font-sans font-normal text-muted">檔</span>
              </div>
            </div>
          </div>

          <div className="card-glass py-3 px-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
              <Trophy size={20} />
            </div>
            <div>
              <div className="text-xs text-secondary">本月勝率</div>
              <div className="text-xl font-bold font-mono text-up">
                {stats.winRate || 0}%
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={fetchMonitorData} className="btn btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
            <RefreshCw size={14} />
            <span>重新整理</span>
          </button>
          
          <button className="btn btn-primary">
            <Plus size={16} />
            <span>新增持倉</span>
          </button>
        </div>
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
