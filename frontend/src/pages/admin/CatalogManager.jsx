import { useState, useEffect } from 'react';
import { getCatalogStatus, triggerCatalogSync } from '../../services/api';
import { Database, RefreshCw, Loader2, CheckCircle, Clock } from 'lucide-react';

export default function CatalogManager() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError]     = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getCatalogStatus();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await triggerCatalogSync();
      // Poll status every 5 seconds
      const interval = setInterval(async () => {
        try {
          const data = await getCatalogStatus();
          setStatus(data);
          if (!data.enProgreso) {
            clearInterval(interval);
            setSyncing(false);
          }
        } catch { /* ignore */ }
      }, 5000);
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-kenya-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Catálogo PeruCompras</h2>
        <button
          onClick={handleSync}
          disabled={syncing || status?.enProgreso}
          className="btn-primary text-sm flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sincronizar Ahora'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{status?.totalFichas || 0}</p>
              <p className="text-xs text-gray-400">Fichas totales</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              {status?.enProgreso ? (
                <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {status?.enProgreso ? 'Sincronizando...' : 'Listo'}
              </p>
              <p className="text-xs text-gray-400">Estado</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {status?.ultimoSync
                  ? new Date(status.ultimoSync.sync_date).toLocaleString('es-PE')
                  : 'Nunca'}
              </p>
              <p className="text-xs text-gray-400">Último sync</p>
            </div>
          </div>
        </div>
      </div>

      {/* Brand breakdown */}
      {status?.fichasPorMarca?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Fichas por Marca</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-2 font-medium text-gray-600">Marca</th>
                <th className="text-left px-5 py-2 font-medium text-gray-600">Categoría</th>
                <th className="text-right px-5 py-2 font-medium text-gray-600">Fichas</th>
                <th className="text-right px-5 py-2 font-medium text-gray-600">Actualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {status.fichasPorMarca.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-800 uppercase">{row.marca}</td>
                  <td className="px-5 py-2.5 text-gray-600 capitalize">{row.categoria || '-'}</td>
                  <td className="px-5 py-2.5 text-right font-mono">{row.total}</td>
                  <td className="px-5 py-2.5 text-right text-gray-400 text-xs">
                    {row.ultima_actualizacion
                      ? new Date(row.ultima_actualizacion).toLocaleDateString('es-PE')
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
