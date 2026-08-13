import { AlertCircle, Target, TrendingUp, Bell } from 'lucide-react';
import { formatTime } from '../../utils/formatters';

export default function AlertTimeline({ alerts = [] }) {
  const getIcon = (type) => {
    switch(type) {
      case 'ENTRY': return <Target size={16} className="text-[var(--accent-blue)]" />;
      case 'EXIT': return <AlertCircle size={16} className="text-[var(--color-up)]" />;
      case 'PROFIT': return <TrendingUp size={16} className="text-[var(--color-down)]" />;
      default: return <Bell size={16} className="text-[var(--accent-gold)]" />;
    }
  };

  const getBorderColor = (type) => {
    switch(type) {
      case 'ENTRY': return 'border-blue-500/50';
      case 'EXIT': return 'border-red-500/50';
      case 'PROFIT': return 'border-green-500/50';
      default: return 'border-yellow-500/50';
    }
  };

  return (
    <div className="card-glass flex flex-col h-full">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
        <Bell className="text-[var(--accent-gold)]" />
        最新動態
      </h3>
      
      <div className="flex-1 overflow-y-auto pr-2 relative">
        <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--card-border)]"></div>
        
        <div className="flex flex-col gap-4">
          {alerts.length === 0 ? (
            <div className="text-center text-muted py-8 text-sm">暫無最新動態</div>
          ) : (
            alerts.map((alert, idx) => (
              <div 
                key={alert.id || idx} 
                className="flex gap-4 animate-slide-up" 
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className={`relative z-10 w-8 h-8 rounded-full bg-black/50 border flex items-center justify-center shrink-0 ${getBorderColor(alert.type)}`}>
                  {getIcon(alert.type)}
                </div>
                <div className="flex flex-col gap-1 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{alert.title}</span>
                    <span className="text-xs text-muted font-mono">{formatTime(alert.timestamp)}</span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">{alert.description}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
