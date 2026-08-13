import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Radar, Eye, History, Settings, Bot, Sparkles } from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function Sidebar() {
  const { isConnected } = useWebSocket();

  const navItems = [
    { path: '/', label: '儀表板', icon: LayoutDashboard },
    { path: '/radar', label: '進場雷達', icon: Radar },
    { path: '/monitor', label: '持倉監控', icon: Eye },
    { path: '/history', label: '歷史紀錄', icon: History },
    { path: '/settings', label: '系統設定', icon: Settings },
  ];

  return (
    <aside className="sidebar hidden md:flex">
      <div className="p-6 border-b border-[var(--card-border)] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
          <Radar size={20} className="text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-wider">台股策略雷達</h1>
      </div>

      <nav className="flex-1 py-6 flex flex-col gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => 
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          );
        })}

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-ai-chat'))}
          className="sidebar-link w-full text-left flex items-center justify-between group cursor-pointer mt-4 border border-transparent hover:border-[var(--accent-blue)]/30"
        >
          <div className="flex items-center gap-3">
            <Bot size={20} className="group-hover:text-[var(--accent-blue)] transition-colors" />
            <span className="font-medium text-[var(--accent-blue)]">AI 專屬顧問</span>
          </div>
          <Sparkles size={16} className="text-amber-400 opacity-70 group-hover:opacity-100 animate-pulse" />
        </button>
      </nav>

      <div className="p-4 m-4 rounded-xl bg-black/20 border border-[var(--card-border)] flex flex-col gap-2">
        <div className="text-xs text-muted font-medium mb-1">系統狀態</div>
        <div className="flex items-center justify-between">
          <span className="text-sm">資料連線</span>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
            <span className="text-xs text-secondary">{isConnected ? '已連線' : '斷線'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
