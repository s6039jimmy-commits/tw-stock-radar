import { useNavigate } from 'react-router-dom';
import { Clock, Newspaper, ArrowRight, MessageSquareText } from 'lucide-react';
import StockBadge from '../common/StockBadge';
import StarRating from '../common/StarRating';
import ConfidenceMeter from '../common/ConfidenceMeter';
import { formatTime, formatPrice } from '../../utils/formatters';

export default function RadarSignalCard({ signal, onConfirmEntry }) {
  const navigate = useNavigate();
  const isBullish = signal.sentiment === 'BULLISH' || signal.ai_sentiment === 'BULLISH';
  const isBearish = signal.sentiment === 'BEARISH' || signal.ai_sentiment === 'BEARISH';
  
  const badgeClass = isBullish ? 'badge-bullish' : isBearish ? 'badge-bearish' : 'badge-neutral';
  const glowClass = (signal.ai_stars || 4) >= 5 ? 'card-glow-gold' : '';

  const handleAskAI = () => {
    navigate('/chat', {
      state: {
        stockContext: {
          symbol: signal.symbol,
          name: signal.name,
          price: signal.current_price
        }
      }
    });
  };

  return (
    <div className={`card-glass ${glowClass} flex flex-col gap-4 animate-slide-up relative group hover:border-blue-500/40 transition-all`}>
      <div className="flex justify-between items-start">
        <StockBadge symbol={signal.symbol} name={signal.name} type={signal.signal_type || signal.type} />
        <div className="flex flex-col items-end gap-1">
          <span className={`badge ${badgeClass} text-xs`}>
            {isBullish ? '看多 (利多)' : isBearish ? '看空 (利空)' : '中立'}
          </span>
          <span className="text-xs text-muted flex items-center gap-1">
            <Clock size={12} /> {formatTime(signal.created_at || signal.timestamp)}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4 items-center bg-black/20 p-3 rounded-lg border border-[var(--card-border)]">
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-secondary font-medium">AI 信心評級</span>
          <StarRating rating={signal.ai_stars || 4} />
        </div>
        <div className="flex justify-end">
          <ConfidenceMeter score={(signal.ai_stars || 4) * 20} />
        </div>
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="text-sm line-clamp-3 text-primary leading-relaxed">
          {signal.ai_reasoning || signal.reasoning}
        </div>
        
        {(signal.news_headline || signal.headline) && (
          <div className="flex items-start gap-2 mt-1 p-2.5 bg-blue-500/5 rounded-lg text-xs border border-blue-500/20">
            <Newspaper size={14} className="text-accent-blue mt-0.5 shrink-0" />
            <span className="text-secondary italic line-clamp-2">{signal.news_headline || signal.headline}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-[var(--card-border)] gap-2">
        <div className="flex flex-col">
          <span className="text-xs text-muted">目前價格</span>
          <span className="font-mono font-bold text-lg text-primary">{formatPrice(signal.current_price)}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Ask AI Advisor Button */}
          <button 
            onClick={handleAskAI}
            className="btn btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 border border-indigo-500/30 hover:border-indigo-500/60 hover:text-indigo-300"
            title="開啟對話框詢問 AI 顧問"
          >
            <MessageSquareText size={14} className="text-indigo-400" />
            <span>問 AI 顧問</span>
          </button>

          {/* Confirm Entry Button */}
          <button 
            onClick={() => onConfirmEntry && onConfirmEntry(signal)}
            className="btn btn-primary py-2 px-3 text-xs flex items-center gap-1"
          >
            <span>進場</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
