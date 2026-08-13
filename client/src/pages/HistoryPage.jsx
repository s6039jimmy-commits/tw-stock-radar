import { useState } from 'react';
import { CheckCircle2, XCircle, BarChart2 } from 'lucide-react';
import { formatPrice, formatPercent, getProfitClass, formatDate } from '../utils/formatters';

export default function HistoryPage() {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState({ total_trades: 0, win_rate: 0, avg_profit: 0 });

  useEffect(() => {
    const fetchHistoryData = async () => {
      try {
        const [tradesRes, statsRes] = await Promise.all([
          fetch('/api/history/trades').then(res => res.json()).catch(() => ({ success: false, data: [] })),
          fetch('/api/history/stats').then(res => res.json()).catch(() => ({ success: false, data: { total_trades: 0, win_rate: 0, avg_profit: 0 } }))
        ]);
        if (tradesRes?.success) setTrades(tradesRes.data || []);
        if (statsRes?.success) setStats(statsRes.data || { total_trades: 0, win_rate: 0, avg_profit: 0 });
      } catch (e) {
        console.error('Failed to fetch history data', e);
      }
    };
    fetchHistoryData();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-glass flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><BarChart2 size={24} /></div>
          <div><div className="text-sm text-secondary">總交易次數</div><div className="text-2xl font-bold font-mono">{stats.total_trades || 0}</div></div>
        </div>
        <div className="card-glass flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-green-400"><CheckCircle2 size={24} /></div>
          <div><div className="text-sm text-secondary">勝率</div><div className="text-2xl font-bold font-mono text-[var(--color-up)]">{stats.win_rate || 0}%</div></div>
        </div>
        <div className="card-glass flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-400"><XCircle size={24} /></div>
          <div><div className="text-sm text-secondary">平均獲利</div><div className="text-2xl font-bold font-mono text-[var(--color-up)]">{stats.avg_profit > 0 ? '+' : ''}{stats.avg_profit || 0}%</div></div>
        </div>
      </div>

      <div className="card-glass p-0 overflow-hidden mt-2">
        <table className="data-table">
          <thead className="bg-black/20">
            <tr>
              <th>股票</th>
              <th>進場日期</th>
              <th>出場日期</th>
              <th>進場價</th>
              <th>出場價</th>
              <th>損益%</th>
              <th>出場原因</th>
            </tr>
          </thead>
          <tbody>
            {trades.map(trade => (
              <tr key={trade.id}>
                <td><span className="font-bold">{trade.name}</span> <span className="text-xs text-secondary">{trade.symbol}</span></td>
                <td className="font-mono text-sm">{formatDate(trade.entry_date)}</td>
                <td className="font-mono text-sm">{formatDate(trade.exit_date)}</td>
                <td className="font-mono">{formatPrice(trade.entry_price)}</td>
                <td className="font-mono">{formatPrice(trade.exit_price)}</td>
                <td className={`font-mono font-bold ${getProfitClass(trade.profit_pct)}`}>{formatPercent(trade.profit_pct)}</td>
                <td>
                  <span className={`badge ${trade.profit_pct > 0 ? 'badge-bullish' : 'badge-bearish'}`}>
                    {trade.reason === 'TAKE_PROFIT' ? '停利出場' : '停損出場'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
