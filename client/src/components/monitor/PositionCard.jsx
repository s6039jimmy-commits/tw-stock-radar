import { formatPrice, formatPercent, getProfitClass } from '../../utils/formatters';
import { Target, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';

export default function PositionCard({ position }) {
  if (!position) return null;

  const pnl = position.current_price - position.entry_price;
  const pnlPct = (pnl / position.entry_price) * 100;
  const colorClass = getProfitClass(pnlPct);
  
  // Mock thresholds
  const stopLoss = position.entry_price * 0.95;
  const takeProfit = position.entry_price * 1.15;
  
  const distanceToSl = ((position.current_price - stopLoss) / position.current_price) * 100;
  
  return (
    <div className="card-glass flex flex-col gap-4">
      <div className="flex justify-between items-start border-b border-[var(--card-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{position.name}</h3>
            <span className="text-sm font-mono text-secondary px-2 py-0.5 bg-white/10 rounded">{position.symbol}</span>
          </div>
          <span className="text-xs text-muted mt-1">進場時間: {new Date(position.entry_date).toLocaleDateString('zh-TW')}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-sm text-secondary">未實現損益</span>
          <span className={`text-2xl font-bold font-mono ${colorClass}`}>
            {pnl > 0 ? '+' : ''}{formatPrice(Math.abs(pnl)).replace('NT$ ', '')} ({formatPercent(pnlPct)})
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
