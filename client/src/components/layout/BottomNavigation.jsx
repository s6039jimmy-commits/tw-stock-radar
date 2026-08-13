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
      <div className="bottom-nav-inner">
        
        {/* Left Side Items */}
        <div className="bottom-nav-group">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={22} />
                <span style={{fontSize: '10px'}}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Center FAB (AI Bot) */}
        <div className="bottom-nav-fab-container">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-ai-chat'))}
            className="bottom-nav-fab"
          >
            <Bot size={26} />
          </button>
          <span className="fab-label">AI 顧問</span>
        </div>

        {/* Right Side Items */}
        <div className="bottom-nav-group">
          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={22} />
                <span style={{fontSize: '10px'}}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
        
      </div>
    </div>
  );
}
