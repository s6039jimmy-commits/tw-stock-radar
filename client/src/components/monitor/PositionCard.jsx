import { useState } from 'react';
import { formatPrice, formatPercent, getProfitClass } from '../../utils/formatters';
import { Target, TrendingDown, TrendingUp, AlertTriangle, Edit2 } from 'lucide-react';

export default function PositionCard({ position }) {
  const [isEditingShares, setIsEditingShares] = useState(false);
  const [sharesValue, setSharesValue] = useState(position?.shares || 1000);

  if (!position) return null;

  const shares = position.shares || 1000; // 預設 1000 股 (1張)
  const pnlPerShare = position.current_price - position.entry_price;
  const totalPnl = pnlPerShare * shares;
  const pnlPct = (pnlPerShare / position.entry_price) * 100;
  const colorClass = getProfitClass(pnlPct);
  
  // Mock thresholds
  const stopLoss = position.entry_price * (1 + (position.stop_loss_pct / 100));
  const takeProfit = position.entry_price * (1 + (position.take_profit_pct / 100));
  
  const distanceToSl = ((position.current_price - stopLoss) / position.current_price) * 100;
  
  const handleSaveShares = async () => {
    setIsEditingShares(false);
    const val = parseInt(sharesValue, 10);
    if (!isNaN(val) && val > 0 && val !== shares) {
      try {
        await fetch(`/api/monitor/positions/${position.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shares: val })
        });
        // 畫面會在下次 5 秒 polling 時自動更新為新股數
      } catch (e) {
        console.error('Failed to update shares', e);
      }
    } else {
      setSharesValue(shares);
    }
  };

  return (
    <div className="card-glass flex flex-col gap-4">
      <div className="flex justify-between items-start border-b border-[var(--card-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{position.name}</h3>
            <span className="text-sm font-mono text-secondary px-2 py-0.5 bg-white/10 rounded">{position.symbol}</span>
            {isEditingShares ? (
              <input
                type="number"
                autoFocus
                className="w-20 px-2 py-0.5 text-xs bg-black/40 border border-indigo-500/50 rounded outline-none text-indigo-400 font-mono"
                value={sharesValue}
                onChange={(e) => setSharesValue(e.target.value)}
                onBlur={handleSaveShares}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveShares()}
              />
            ) : (
              <button 
                onClick={() => setIsEditingShares(true)}
                className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full hover:bg-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                title="點擊修改股數"
              >
                {shares} 股 <Edit2 size={10} />
              </button>
            )}
          </div>
          <span className="text-xs text-muted mt-1">進場日: {new Date(position.entry_date).toLocaleDateString('zh-TW')}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm text-secondary">未實現損益</span>
          <span className={`text-2xl font-bold font-mono ${colorClass}`}>
            {totalPnl > 0 ? '+' : ''}{formatPrice(Math.abs(totalPnl)).replace('NT$ ', '')} ({formatPercent(pnlPct)})
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-black/20 p-3 rounded-lg flex flex-col gap-1">
          <span className="text-xs text-secondary flex items-center gap-1"><Target size={12}/> 進場均價</span>
          <span className="font-mono font-medium">{formatPrice(position.entry_price)}</span>
        </div>
        <div className="bg-black/20 p-3 rounded-lg flex flex-col gap-1 border border-blue-500/20">
          <span className="text-xs text-accent-blue flex items-center gap-1"><TrendingUp size={12}/> 目前報價</span>
          <span className="font-mono font-bold text-lg">{formatPrice(position.current_price)}</span>
        </div>
      </div>
      
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex justify-between text-xs">
          <span className="text-red-400 flex items-center gap-1"><TrendingDown size={12}/> 停損 {formatPrice(stopLoss)}</span>
          <span className="text-green-400 flex items-center gap-1"><TrendingUp size={12}/> 停利 {formatPrice(takeProfit)}</span>
        </div>
        <div className="relative w-full h-2 bg-black/40 rounded-full overflow-hidden">
          {/* Progress bar visualizing current price between SL and TP */}
          <div className="absolute top-0 bottom-0 left-0 bg-red-500/50" style={{ width: '20%' }}></div>
          <div className="absolute top-0 bottom-0 right-0 bg-green-500/50" style={{ width: '20%' }}></div>
          <div className="absolute top-0 bottom-0 bg-white/80 w-1 rounded-full shadow-[0_0_8px_white]" 
               style={{ left: `${Math.min(Math.max(20 + (pnlPct + 5) * 4, 0), 100)}%` }}></div>
        </div>
      </div>
      
      {distanceToSl < 2 && (
        <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-400 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold text-red-400">接近停損警告</span>
            <span className="text-xs text-red-200">目前價格距離設定停損點僅差 {formatPercent(distanceToSl)}</span>
          </div>
        </div>
      )}
      
      <button className="btn btn-danger w-full mt-2">
        確認平倉出場
      </button>
    </div>
  );
}
