import { useState, useEffect } from 'react';
import MarketOverview from '../components/dashboard/MarketOverview';
import RadarSignalCard from '../components/dashboard/RadarSignalCard';
import AlertTimeline from '../components/dashboard/AlertTimeline';
import { Activity, Target, Trophy, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const [signals, setSignals] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ winRate: 0 });
  const [positionsCount, setPositionsCount] = useState(0);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [signalsRes, alertsRes, statsRes, positionsRes] = await Promise.all([
        fetch('/api/radar/signals').then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch('/api/monitor/alerts').then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch('/api/history/stats').then(res => res.json()).catch(() => ({ success: false, data: { winRate: 0 } })),
        fetch('/api/monitor/positions').then(res => res.json()).catch(() => ({ success: false, data: [] }))
      ]);
      
      setSignals(signalsRes?.data || []);
      setAlerts(alertsRes?.data || []);
      
      // Store stats in some state or let's use window for now, wait we need state
      setStats(statsRes?.data || { winRate: 0 });
      setPositionsCount((positionsRes?.data || []).length);
    } catch (e) {
      console.error('Fetch dashboard data failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleManualScan = async () => {
    setLoading(true);
    try {
      await fetch('/api/radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' })
      });
      await fetchDashboardData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <MarketOverview />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Target className="text-blue-400" /> 最新 AI 策略雷達訊號
            </h2>
            <button 
              onClick={handleManualScan}
              disabled={loading}
              className="btn btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>{loading ? '掃描中...' : '手動觸發雷達掃描'}</span>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {signals.map(signal => (
              <RadarSignalCard key={signal.id || signal.symbol} signal={signal} />
            ))}
          </div>
        </div>
        
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card-glass p-4 flex flex-col gap-2">
              <span className="text-xs text-secondary flex items-center gap-1"><Activity size={14}/> 監控中部位</span>
              <span className="text-2xl font-bold font-mono">{positionsCount} <span className="text-sm font-sans font-normal text-muted">檔</span></span>
            </div>
            <div className="card-glass p-4 flex flex-col gap-2">
              <span className="text-xs text-secondary flex items-center gap-1"><Trophy size={14}/> 本月勝率</span>
              <span className="text-2xl font-bold font-mono text-up">{stats.winRate || 0}%</span>
            </div>
          </div>
          
          <div className="flex-1 min-h-[380px]">
            <AlertTimeline alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
