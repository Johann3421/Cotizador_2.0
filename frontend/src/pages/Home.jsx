import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileText, Search, Trash2, Eye, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { listQuotes, deleteQuote, getQuotePDFUrl } from '../services/api';

export default function Home() {
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
      fetchQuotes();
    } catch (error) {
      alert('Error al eliminar: ' + error.message);
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

  const estadoBadge = (estado) => {
    const styles = {
      borrador: 'badge-yellow',
      enviada: 'badge-blue',
      aprobada: 'badge-green',
    };
    return styles[estado] || 'badge-gray';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cotizaciones</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} cotización{total !== 1 ? 'es' : ''} en total
          </p>
        </div>
        <Link to="/new" className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nueva Cotización
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
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
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-kenya-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Cargando cotizaciones...
          </div>
        ) : quotes.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No hay cotizaciones</p>
            <p className="text-gray-400 text-sm mt-1">Crea tu primera cotización para comenzar</p>
            <Link to="/new" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> Nueva Cotización
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
                  {quotes.map((quote) => (
                    <tr key={quote.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm font-medium text-kenya-600">{quote.numero_cotizacion}</span>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-800">{quote.cliente || '—'}</p>
                        {quote.ruc && <p className="text-xs text-gray-400">RUC: {quote.ruc}</p>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{formatDate(quote.created_at)}</td>
                      <td className="py-3 px-4 text-sm text-right font-medium text-gray-800">{formatCurrency(quote.total)}</td>
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
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="btn-ghost p-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="btn-ghost p-2"
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
