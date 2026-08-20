import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  Bus,
  Users,
  Receipt,
  Brain,
  AlertTriangle,
  DollarSign,
  UserCheck,
  FileText,
  Megaphone,
  ScrollText,
  User,
  LogOut,
  Menu,
  X,
  Bell
} from 'lucide-react';

const Sidebar = ({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (open: boolean) => void }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    navigate('/login');
  };

  const menuItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/trips', icon: Bus, label: 'Trip Management' },
    { path: '/live-operations', icon: Map, label: 'Live Operations' },
    { path: '/passengers', icon: Users, label: 'Passenger Analytics' },
    { path: '/conductors', icon: UserCheck, label: 'Manage Users' },
    { path: '/transactions', icon: Receipt, label: 'Card Management' },
    { path: '/revenue', icon: DollarSign, label: 'Fare Matrix' },
    { path: '/reports', icon: FileText, label: 'Reports' },
    { path: '/activity-log', icon: ScrollText, label: 'Audit Logs' },
    { path: '/ai-monitoring', icon: Brain, label: 'AI Monitoring' },
    { path: '/emergency', icon: AlertTriangle, label: 'Emergency' },
    { path: '/announcements', icon: Megaphone, label: 'Announcements' },
  ];

  const isItemActive = (path: string) => location.pathname === path;

  return (
    <aside className={`glass-sidebar fixed left-0 top-0 h-full z-50 transition-all duration-300 ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="CommutAI Logo" 
            className="w-10 h-10"
          />
          {isOpen && <span className="text-white font-bold text-xl">CommutAI</span>}
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-white hover:text-orange-400 transition-colors"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <nav className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-160px)]">
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

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 w-full text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
        >
          <LogOut size={20} />
          {isOpen && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

const Header = () => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(3);

  return (
    <header className="glass-card h-16 flex items-center justify-between px-6 mb-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative"
          >
            <Bell className="text-white hover:text-orange-400 cursor-pointer transition-colors" size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-xs text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
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
