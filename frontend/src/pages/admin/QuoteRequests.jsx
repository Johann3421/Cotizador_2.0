import { useState, useEffect } from 'react';
import { listQuoteRequests, updateQuoteRequestStatus, markQuoteRequestSent } from '../../services/api';
import { Loader2, Eye, Send, CheckCircle, Clock, XCircle, FileText } from 'lucide-react';

const STATUS_BADGE = {
  pendiente:  { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  en_proceso: { color: 'bg-blue-100 text-blue-700',   icon: Loader2 },
  enviada:    { color: 'bg-green-100 text-green-700',  icon: Send },
  rechazada:  { color: 'bg-red-100 text-red-700',     icon: XCircle },
};

export default function QuoteRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [actionId, setActionId] = useState(null);
  const [detailModal, setDetailModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listQuoteRequests();
      setRequests(data.solicitudes || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = async (id, estado) => {
    setActionId(id);
    try {
      await updateQuoteRequestStatus(id, estado);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  };

  const handleMarkSent = async (id) => {
    const pdfUrl = prompt('URL del PDF de cotización (opcional):');
    setActionId(id);
    try {
      await markQuoteRequestSent(id, pdfUrl || undefined);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Solicitudes de Cotización</h2>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-1">
          <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Cerrar</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-kenya-600" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay solicitudes de cotización</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contacto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => {
                const badge = STATUS_BADGE[r.estado] || STATUS_BADGE.pendiente;
                const BadgeIcon = badge.icon;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{r.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{r.nombre_contacto}</p>
                      <p className="text-xs text-gray-400">{r.email_contacto}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.empresa || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(r.created_at).toLocaleDateString('es-PE')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {actionId === r.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        ) : (
                          <>
                            <button
                              onClick={() => setDetailModal(r)}
                              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                              title="Ver detalle"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {r.estado === 'pendiente' && (
                              <button
                                onClick={() => handleStatusChange(r.id, 'en_proceso')}
                                className="px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg"
                              >
                                En proceso
                              </button>
                            )}
                            {(r.estado === 'pendiente' || r.estado === 'en_proceso') && (
                              <button
                                onClick={() => handleMarkSent(r.id)}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Marcar como enviada"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetailModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Solicitud #{detailModal.id}</h3>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-gray-400 text-xs">Contacto</label>
                  <p className="font-medium">{detailModal.nombre_contacto}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Email</label>
                  <p className="font-medium">{detailModal.email_contacto}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Teléfono</label>
                  <p className="font-medium">{detailModal.telefono || '-'}</p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs">Empresa</label>
                  <p className="font-medium">{detailModal.empresa || '-'}</p>
                </div>
              </div>
              {detailModal.notas && (
                <div>
                  <label className="text-gray-400 text-xs">Notas</label>
                  <p className="mt-1 p-3 bg-gray-50 rounded-lg">{detailModal.notas}</p>
                </div>
              )}
              {detailModal.pdf_url && (
                <div>
                  <label className="text-gray-400 text-xs">PDF</label>
                  <a href={detailModal.pdf_url} target="_blank" rel="noopener noreferrer" className="text-kenya-600 underline block mt-1">
                    Descargar PDF
                  </a>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setDetailModal(null)} className="btn-secondary text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
