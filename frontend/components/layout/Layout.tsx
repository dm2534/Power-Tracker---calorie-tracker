import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Flame, ScrollText, Skull } from 'lucide-react';
import { KenpachiLogo, SwordIcon } from '../ui/Icons';
import { KENPACHI_QUOTES } from '../../constants';
import { db } from '../../services/db';

const QuoteRotator = () => {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % KENPACHI_QUOTES.length);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mt-auto p-6 border-t border-border-strong hidden md:block">
      <p className="font-mono text-xs text-muted italic">"{KENPACHI_QUOTES[quoteIdx]}"</p>
    </div>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = db.getUser();

  useEffect(() => {
    if (!user && location.pathname !== '/login' && location.pathname !== '/signup') {
      navigate('/login');
    }
  }, [user, location, navigate]);

  if (!user) return <>{children}</>;

  const navItems = [
    { path: '/dashboard', icon: SwordIcon, label: 'POWER' },
    { path: '/log', icon: Flame, label: 'CONSUME' },
    { path: '/history', icon: ScrollText, label: 'FALLEN' },
    { path: '/profile', icon: Skull, label: 'VITALS' },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-primary text-text">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border-strong bg-surface z-10">
        <div className="p-6 flex items-center gap-4 border-b border-border-strong">
          <KenpachiLogo className="w-10 h-10" />
          <h1 className="font-display text-3xl tracking-widest mt-2">SOUL FEAST</h1>
        </div>
        
        <nav className="flex-1 py-6 flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                to={item.path}
                className={`flex items-center gap-4 px-6 py-4 font-bold tracking-widest transition-all ${
                  isActive 
                    ? 'bg-elevated text-white border-l-4 border-white' 
                    : 'text-muted hover:text-white hover:bg-elevated border-l-4 border-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        
        <QuoteRotator />
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto relative">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border-strong flex justify-around items-center h-16 z-50">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link 
              key={item.path} 
              to={item.path}
              className={`flex flex-col items-center justify-center w-full h-full ${
                isActive ? 'text-white border-t-2 border-white' : 'text-muted border-t-2 border-transparent'
              }`}
            >
              <Icon className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-bold tracking-widest">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
