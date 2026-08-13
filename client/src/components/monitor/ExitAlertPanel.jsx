import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { formatTime } from '../../utils/formatters';

export default function ExitAlertPanel({ alerts = [] }) {
  return (
    <div className="card-glass flex flex-col h-full border-red-500/20">
      <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-red-400">
        <AlertTriangle size={20} />
        出場警示
      </h3>
      
      <div className="flex flex-col gap-3 overflow-y-auto pr-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted gap-2">
            <CheckCircle2 size={32} className="text-green-500/50" />
            <span className="text-sm">目前無出場警示，持股狀況良好</span>
          </div>
        ) : (
          alerts.map((alert, i) => (
            <div key={i} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{alert.symbol} {alert.name}</span>
                  <span className="badge badge-bearish text-[10px] px-1.5 py-0">賣出訊號</span>
                </div>
                <span className="text-xs text-muted font-mono">{formatTime(alert.timestamp)}</span>
              </div>
              <p className="text-sm text-secondary line-clamp-2">{alert.reasoning}</p>
              <div className="flex justify-end mt-1">
                <button className="text-xs text-red-400 hover:text-red-300 font-medium">檢視詳情 →</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
