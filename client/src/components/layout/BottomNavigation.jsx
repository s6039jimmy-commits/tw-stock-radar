import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Radar, Eye, History, Settings, Bot } from 'lucide-react';

export default function BottomNavigation() {
  const navItems = [
    { path: '/', label: '總覽', icon: LayoutDashboard },
    { path: '/radar', label: '雷達', icon: Radar },
    { path: '/monitor', label: '監控', icon: Eye },
    { path: '/settings', label: '設定', icon: Settings },
  ];

  return (
    <div className="bottom-nav-container">
      <div className="flex justify-between items-end h-[60px] pb-1 w-full max-w-md mx-auto relative">
        
        {/* Left Side Items */}
        <div className="flex flex-1 justify-around items-center h-full">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 
                  `flex flex-col items-center justify-center w-14 gap-1 transition-all duration-300 ${isActive ? 'text-[var(--accent-blue)] font-bold' : 'text-secondary hover:text-[var(--accent-blue)]'}`
                }
              >
                <Icon size={22} className="mb-0.5" />
                <span className="text-[10px] tracking-wide">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Center FAB (AI Bot) */}
        <div className="flex flex-col items-center justify-center w-[80px] -mt-6">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-ai-chat'))}
            className="w-[56px] h-[56px] rounded-full bg-gradient-to-tr from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center shadow-[0_4px_15px_rgba(37,99,235,0.4)] border-[4px] border-[var(--bg-secondary)] transform hover:scale-105 transition-transform active:scale-95 z-10"
          >
            <Bot size={26} className="text-white" />
          </button>
          <span className="text-[10px] font-bold text-[var(--accent-blue)] mt-1 drop-shadow-[0_0_2px_rgba(255,255,255,1)]">AI 顧問</span>
        </div>

        {/* Right Side Items */}
        <div className="flex flex-1 justify-around items-center h-full">
          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 
                  `flex flex-col items-center justify-center w-14 gap-1 transition-all duration-300 ${isActive ? 'text-[var(--accent-blue)] font-bold' : 'text-secondary hover:text-[var(--accent-blue)]'}`
                }
              >
                <Icon size={22} className="mb-0.5" />
                <span className="text-[10px] tracking-wide">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}
