import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Search, Trash2, Eye, Download, ChevronLeft, ChevronRight, Sparkles, TrendingUp, Clock } from 'lucide-react';
import { listQuotes, deleteQuote, getQuotePDFUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Home() {
  const { user } = useAuth();
  const toast = useToast();
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [estadoFilter, setEstadoFilter] = useState('');

  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const data = await listQuotes({ page, search, estado: estadoFilter || undefined });
      setQuotes(data.quotes || []);
      setTotalPages(data.total_pages || 1);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error cargando cotizaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, [page, estadoFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchQuotes();
  };

  const handleDelete = async (id, numero) => {
    if (!confirm(`¿Eliminar cotización ${numero}?`)) return;
    try {
      await deleteQuote(id);
      toast.success(`Cotización ${numero} eliminada`);
      fetchQuotes();
    } catch (error) {
      toast.error('Error al eliminar: ' + error.message);
    }
  };

  const formatCurrency = (amount) =>
    `S/. ${parseFloat(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getRelativeDate = (dateStr) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return formatDate(dateStr);
  };

  const estadoBadge = (estado) => {
    const styles = {
      borrador: 'badge-yellow',
      enviada: 'badge-blue',
      aprobada: 'badge-green',
    };
    return styles[estado] || 'badge-gray';
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="welcome-banner animate-fade-in">
        <div className="welcome-banner-content">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {getGreeting()}, {user?.nombre?.split(' ')[0] || 'Usuario'} 👋
              </h1>
              <p className="text-red-200 text-sm mt-1">
                Sistema de Cotización Inteligente — Kenya Distribuidora
              </p>
            </div>
            <Link to="/new" className="bg-white text-kenya-600 px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-red-50 transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Nueva Cotización
            </Link>
          </div>

          {/* Quick stats */}
          {total > 0 && (
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-red-500/30">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-300" />
                <span className="text-sm text-red-100">{total} cotización{total !== 1 ? 'es' : ''}</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-red-300" />
                <span className="text-sm text-red-100">
                  {quotes.filter(q => q.estado === 'aprobada').length} aprobada{quotes.filter(q => q.estado === 'aprobada').length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-300" />
                <span className="text-sm text-red-100">
                  {quotes.filter(q => q.estado === 'borrador').length} en borrador
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card animate-fade-in" style={{ animationDelay: '100ms' }}>
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por N° cotización, cliente o RUC..."
              className="input-field pl-10"
            />
          </form>
          <select
            value={estadoFilter}
            onChange={(e) => { setEstadoFilter(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="enviada">Enviada</option>
            <option value="aprobada">Aprobada</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden animate-fade-in" style={{ animationDelay: '200ms' }}>
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-kenya-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="font-medium text-gray-500">Cargando cotizaciones...</p>
            <p className="text-sm text-gray-400 mt-1">Un momento por favor</p>
          </div>
        ) : quotes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <FileText className="w-10 h-10 text-kenya-400" />
            </div>
            <p className="text-lg font-semibold text-gray-700 mb-1">No hay cotizaciones</p>
            <p className="text-gray-400 text-sm max-w-xs mx-auto">
              Crea tu primera cotización inteligente. Solo necesitas una imagen del requerimiento y la IA hará el resto.
            </p>
            <Link to="/new" className="btn-primary inline-flex items-center gap-2 mt-5">
              <Sparkles className="w-4 h-4" />
              Crear Primera Cotización
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">N° Cotización</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((quote, index) => (
                    <tr
                      key={quote.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors animate-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm font-medium text-kenya-600">{quote.numero_cotizacion}</span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-800">{quote.cliente || '—'}</p>
                        {quote.ruc && <p className="text-xs text-gray-400">RUC: {quote.ruc}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-700">{getRelativeDate(quote.created_at)}</p>
                        <p className="text-[11px] text-gray-400">{formatDate(quote.created_at)}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-right font-semibold text-gray-800">{formatCurrency(quote.total)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${estadoBadge(quote.estado)}`}>
                          {(quote.estado || 'borrador').toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            to={`/quote/${quote.id}`}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 text-blue-500" />
                          </Link>
                          <a
                            href={getQuotePDFUrl(quote.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-green-50 rounded-lg transition-colors"
                            title="Descargar PDF"
                          >
                            <Download className="w-4 h-4 text-green-500" />
                          </a>
                          <button
                            onClick={() => handleDelete(quote.id, quote.numero_cotizacion)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Página {page} de {totalPages} · {total} resultado{total !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="btn-ghost p-2 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost p-2 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
