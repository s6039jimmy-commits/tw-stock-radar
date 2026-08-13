import Sidebar from './Sidebar';
import Header from './Header';
import BottomNavigation from './BottomNavigation';

export default function AppLayout({ children }) {
  return (
    <div className="flex bg-[var(--bg-primary)] min-h-screen relative">
      <Sidebar />
      <div className="flex-1 main-content flex flex-col min-w-0">
        <Header />
        <main className="flex-1 page-container w-full animate-fade-in">
          {children}
        </main>
      </div>

      <BottomNavigation />
    </div>
  );
}
