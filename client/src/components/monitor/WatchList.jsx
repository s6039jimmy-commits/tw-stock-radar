import { useState } from 'react';
import { formatPrice, formatPercent, getProfitClass } from '../../utils/formatters';
import { ArrowRight, ShieldAlert } from 'lucide-react';

export default function WatchList({ positions = [] }) {
  if (positions.length === 0) {
    return (
      <div className="card-glass text-center py-12 text-muted">
        目前沒有持倉監控中的股票
      </div>
    );
  }

  return (
    <div className="card-glass overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead className="bg-black/20">
            <tr>
              <th>股票</th>
              <th>進場價</th>
              <th>現價</th>
              <th>損益%</th>
              <th>AI 信心</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
              const pnlPct = ((pos.current_price - pos.entry_price) / pos.entry_price) * 100;
              const pnlClass = getProfitClass(pnlPct);
              
              return (
                <tr key={pos.id} className="transition-colors hover:bg-white/5">
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{pos.name}</span>
                      <span className="text-xs font-mono text-secondary px-1.5 py-0.5 bg-white/10 rounded">{pos.symbol}</span>
                    </div>
                  </td>
                  <td className="font-mono">{formatPrice(pos.entry_price)}</td>
                  <td className="font-mono font-bold">{formatPrice(pos.current_price)}</td>
                  <td className={`font-mono font-bold ${pnlClass}`}>
                    {formatPercent(pnlPct)}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                          style={{ width: `${pos.ai_confidence || 80}%` }}
                        ></div>
                      </div>
                      <span className="text-xs text-secondary font-mono">{pos.ai_confidence || 80}%</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-bullish">監控中</span>
                  </td>
                  <td>
                    <button className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1 border border-white/10 hover:border-white/30">
                      詳細 <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
