import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Receipt,
  Brain,
  FileText,
  User,
  LogOut,
  Menu,
  X,
  Bus
} from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/trips', icon: Bus, label: 'Trip Management' },
    { path: '/transactions', icon: Receipt, label: 'Card Management' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/ai-monitoring', icon: Brain, label: 'AI Monitoring' },
  ];

  const isItemActive = (path: string) => location.pathname === path;

  return (
    <aside className={`glass-sidebar fixed left-0 top-0 h-full z-50 transition-all duration-300 flex flex-col ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        {isOpen && (
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="CommutAI Logo"
              className="w-10 h-10"
            />
            <span className="text-white font-bold text-xl">CommutAI</span>
          </div>
        )}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-white hover:text-orange-400 transition-colors"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <nav className="p-4 space-y-2 overflow-y-auto flex-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={20} />
              {isOpen && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 w-full text-red-400 hover:bg-red-500/20 hover:text-red-300`}
        >
          <LogOut size={20} />
          {isOpen && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

const Header = () => {
  return (
    <header className="glass-card h-16 flex items-center justify-between px-6 mb-6">
      <div></div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-white font-medium">Operations Center</p>
          <p className="text-white/60 text-sm">OMANFORTSCO</p>
        </div>
        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
          <User className="text-white" size={20} />
        </div>
      </div>
    </header>
  );
};

export default function Layout() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen">
      <Sidebar isOpen={isOpen} setIsOpen={setIsOpen} />
      <main className={`transition-all duration-300 ${isOpen ? 'ml-64' : 'ml-20'} p-6`}>
        <Header />
        <Outlet />
      </main>
    </div>
  );
}
