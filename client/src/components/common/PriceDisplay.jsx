import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPrice, formatPercent, getProfitClass } from '../../utils/formatters';

export default function PriceDisplay({ price, change, changePercent }) {
  const isUp = change > 0;
  const isDown = change < 0;
  const colorClass = getProfitClass(change);
  
  return (
    <div className="flex flex-col">
      <div className="text-2xl font-bold font-mono tracking-tight">{formatPrice(price)}</div>
      <div className={`flex items-center gap-1 text-sm font-medium ${colorClass}`}>
        {isUp ? <TrendingUp size={16} /> : isDown ? <TrendingDown size={16} /> : <Minus size={16} />}
        <span>{change > 0 ? '+' : ''}{change} ({formatPercent(changePercent)})</span>
      </div>
    </div>
  );
}
