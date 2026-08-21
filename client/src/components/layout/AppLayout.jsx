import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNavigation from './BottomNavigation';

export default function AppLayout({ children }) {
  const location = useLocation();
  const isChatPage = location.pathname === '/chat';

  return (
    <div className="flex bg-transparent min-h-screen relative">
      <Sidebar />
      <div className="flex-1 main-content flex flex-col min-w-0">
        {!isChatPage && <Header />}
        <main className={`flex-1 w-full animate-fade-in ${isChatPage ? '' : 'page-container'}`}>
          {children}
        </main>
      </div>

      {!isChatPage && <BottomNavigation />}
    </div>
  );
}
