import { BrowserRouter, Routes, Route, useNavigate, Link } from 'react-router-dom';
import { FileText, LogOut, Shield } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import NotificationBell from './components/NotificationBell';
import Home from './pages/Home';
import NewQuote from './pages/NewQuote';
import History from './pages/History';
import Login from './pages/Login';
import Register from './pages/Register';
import PendingApproval from './pages/PendingApproval';
import AdminDashboard from './pages/admin/AdminDashboard';
import DashboardIndex from './pages/admin/DashboardIndex';
import UserManagement from './pages/admin/UserManagement';
import QuoteRequests from './pages/admin/QuoteRequests';
import CatalogManager from './pages/admin/CatalogManager';

function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-kenya-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-kenya-600 leading-none">KENYA</h1>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5">Cotización Inteligente</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link to="/" className="text-sm text-gray-600 hover:text-kenya-600 transition-colors">
                    Inicio
                  </Link>
                  <Link to="/new" className="btn-primary text-sm py-1.5 px-4">
                    + Nueva
                  </Link>
                  {isAdmin && (
                    <>
                      <Link to="/admin" className="text-sm text-gray-600 hover:text-kenya-600 transition-colors flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" />
                        Admin
                      </Link>
                      <NotificationBell />
                    </>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:inline">{user.nombre}</span>
                  <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Cerrar Sesión">
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="text-sm text-gray-600 hover:text-kenya-600 transition-colors">
                    Iniciar Sesión
                  </Link>
                  <Link to="/register" className="btn-primary text-sm py-1.5 px-4">
                    Registrarse
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-400">
          <p>Kenya - Distribuidora de Tecnología | Sistema de Cotización Inteligente</p>
          <p className="mt-1">Powered by IA Vision + PeruCompras</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth pages (no layout) */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/pending-approval" element={<PendingApproval />} />

          {/* Admin panel (own layout) */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminDashboard />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="quote-requests" element={<QuoteRequests />} />
            <Route path="catalog" element={<CatalogManager />} />
          </Route>

          {/* Main app (shared layout) */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout><Home /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/new"
            element={
              <ProtectedRoute>
                <Layout><NewQuote /></Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quote/:id"
            element={
              <ProtectedRoute>
                <Layout><History /></Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
