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
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ symbol: '', entry_price: '', shares: 1000 });

  const fetchMonitorData = useCallback(async () => {
    setIsRefreshing(true);
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
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const submitAddPosition = async () => {
    if (!addForm.symbol || !addForm.entry_price) return;
    try {
      await fetch('/api/monitor/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: addForm.symbol,
          name: addForm.symbol, // 可以接 API 抓名字，這裡先用代號代替
          entry_price: parseFloat(addForm.entry_price),
          shares: parseInt(addForm.shares, 10) || 1000,
          entry_date: new Date().toISOString(),
          entry_reason: '手動新增持倉',
          ai_stars: 0
        })
      });
      setShowAddModal(false);
      setAddForm({ symbol: '', entry_price: '', shares: 1000 });
      fetchMonitorData();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // 初次載入
    fetchMonitorData();
    
    // 設定每 5 秒自動更新一次報價
    const interval = setInterval(fetchMonitorData, 5000);
    return () => clearInterval(interval);
  }, [fetchMonitorData]);

  const totalPnl = positions.reduce((acc, pos) => {
    const shares = pos.shares || 1000;
    return acc + ((pos.current_price - pos.entry_price) * shares);
  }, 0);
  const pnlClass = totalPnl > 0 ? 'text-[var(--color-up)]' : totalPnl < 0 ? 'text-[var(--color-down)]' : '';

  return (
    <div className="flex flex-col gap-6 relative">
      {/* 新增持倉 Modal (霓虹科技感) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0f] border border-cyan-500/50 rounded-xl p-6 w-full max-w-md flex flex-col gap-4 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
            <h3 className="text-xl font-bold flex items-center gap-2 text-cyan-400 tracking-wider">
              <Plus size={20} className="text-cyan-400" /> 新增持倉監控
            </h3>
            
            <div className="flex flex-col gap-1 mt-2">
              <label className="text-xs text-cyan-300/70 tracking-widest">股票代號</label>
              <input 
                type="text" 
                className="bg-black border border-cyan-500/30 text-cyan-50 rounded px-3 py-2 outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-all font-mono placeholder:text-cyan-800/50" 
                placeholder="例: 2317" 
                value={addForm.symbol} 
                onChange={e => setAddForm({...addForm, symbol: e.target.value})} 
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-cyan-300/70 tracking-widest">進場成本價 (NT$)</label>
              <input 
                type="number" 
                step="0.01" 
                className="bg-black border border-cyan-500/30 text-cyan-50 rounded px-3 py-2 outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-all font-mono placeholder:text-cyan-800/50" 
                placeholder="例: 150.5" 
                value={addForm.entry_price} 
                onChange={e => setAddForm({...addForm, entry_price: e.target.value})} 
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-cyan-300/70 tracking-widest">購買股數 (1張 = 1000股)</label>
              <input 
                type="number" 
                className="bg-black border border-cyan-500/30 text-cyan-50 rounded px-3 py-2 outline-none focus:border-cyan-400 focus:shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-all font-mono placeholder:text-cyan-800/50" 
                value={addForm.shares} 
                onChange={e => setAddForm({...addForm, shares: e.target.value})} 
              />
            </div>
            
            <div className="flex justify-end gap-3 mt-4">
              <button 
                className="px-4 py-2 text-sm text-cyan-500 border border-transparent hover:border-cyan-500/50 hover:text-cyan-300 hover:shadow-[0_0_10px_rgba(6,182,212,0.2)] rounded transition-all" 
                onClick={() => setShowAddModal(false)}
              >
                取消
              </button>
              <button 
                className="px-5 py-2 text-sm font-bold bg-cyan-500 text-black border border-cyan-400 rounded shadow-[0_0_10px_rgba(6,182,212,0.5)] hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(6,182,212,0.8)] disabled:opacity-50 disabled:shadow-none transition-all" 
                onClick={submitAddPosition} 
                disabled={!addForm.symbol || !addForm.entry_price}
              >
                確定新增
              </button>
            </div>
          </div>
        </div>
      )}

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
          <button onClick={fetchMonitorData} disabled={isRefreshing} className="btn btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>重新整理</span>
          </button>
          
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
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
