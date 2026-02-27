import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../../components/NotificationBell';
import {
  LayoutDashboard,
  Users,
  FileText,
  Database,
  LogOut,
  ChevronLeft,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/admin',       icon: LayoutDashboard, label: 'Dashboard',     end: true },
  { to: '/admin/users', icon: Users,           label: 'Usuarios' },
  { to: '/admin/quote-requests', icon: FileText, label: 'Solicitudes' },
  { to: '/admin/catalog',       icon: Database, label: 'Catálogo' },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-lg font-bold text-kenya-400">KENYA Admin</h2>
          <p className="text-xs text-gray-400 mt-0.5">{user?.nombre}</p>
          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-kenya-600 text-white uppercase">
            {user?.rol}
          </span>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-kenya-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-700 space-y-2">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver al Sistema
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 h-14 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold text-gray-800">Panel de Administración</h1>
          <NotificationBell />
        </header>

        {/* Content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
