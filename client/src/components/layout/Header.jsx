import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { formatTime } from '../../utils/formatters';
import { useWebSocket } from '../../hooks/useWebSocket';

const routeNames = {
  '/': '儀表板總覽',
  '/radar': 'AI 進場雷達',
  '/monitor': '智能持倉監控',
  '/history': '交易歷史紀錄',
  '/settings': '系統設定'
};

export default function Header() {
  const location = useLocation();
  const [time, setTime] = useState(new Date());
  const { isConnected } = useWebSocket();
  const title = routeNames[location.pathname] || '台股策略雷達';

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = time.getHours();
  const min = time.getMinutes();
  const isMarketOpen = (hour > 9 || (hour === 9 && min >= 0)) && (hour < 13 || (hour === 13 && min <= 30));

  return (
    <header className="header">
      <h2 className="text-xl font-bold">{title}</h2>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className={`badge ${isMarketOpen ? 'badge-bullish' : 'badge-neutral'}`}>
            {isMarketOpen ? '盤中' : '已收盤'}
          </span>
        </div>
        
        <div className="flex items-center gap-2 text-[var(--text-secondary)] font-mono">
          <span>{formatTime(time)}</span>
        </div>
        
        <div className="h-6 w-px bg-[var(--card-border)]"></div>
        
        <div className="flex items-center gap-2">
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
        </div>
      </div>
    </header>
  );
}
