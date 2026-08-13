import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import AIChatModal from '../common/AIChatModal';
import BottomNavigation from './BottomNavigation';

export default function AppLayout({ children }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [stockContext, setStockContext] = useState(null);

  useEffect(() => {
    const handleOpenChat = (e) => {
      if (e.detail) {
        setStockContext(e.detail);
      }
      setIsChatOpen(true);
    };

    window.addEventListener('open-ai-chat', handleOpenChat);
    return () => window.removeEventListener('open-ai-chat', handleOpenChat);
  }, []);

  return (
    <div className="flex bg-[var(--bg-primary)] min-h-screen relative">
      <Sidebar />
      <div className="flex-1 main-content flex flex-col min-w-0 md:pl-0 pb-20 md:pb-0">
        <Header />
        <main className="flex-1 page-container w-full animate-fade-in">
          {children}
        </main>
      </div>

      <BottomNavigation />

      {/* AI Chatbox Modal */}
      <AIChatModal 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        stockContext={stockContext}
      />
    </div>
  );
}
