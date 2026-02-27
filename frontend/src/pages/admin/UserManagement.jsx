import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { listUsers, approveUser, rejectUser, changeUserRole } from '../../services/api';
import { CheckCircle, XCircle, Shield, Loader2, Clock, UserCheck, UserX } from 'lucide-react';

const ROLE_COLORS = {
  superadmin: 'bg-purple-100 text-purple-700',
  admin:      'bg-blue-100 text-blue-700',
  user:       'bg-green-100 text-green-700',
  pending:    'bg-yellow-100 text-yellow-700',
};

export default function UserManagement() {
  const { isSuperAdmin } = useAuth();

  const [users, setUsers]     = useState([]);
  const [filtro, setFiltro]   = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtro !== 'todos') params.estado = filtro;
      const data = await listUsers(params);
      setUsers(data.users || data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filtro]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await approveUser(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id) => {
    const motivo = prompt('Motivo del rechazo:');
    if (!motivo) return;
    setActionLoading(id);
    try {
      await rejectUser(id, motivo);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRoleChange = async (id, newRole) => {
    setActionLoading(id);
    try {
      await changeUserRole(id, newRole);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Gestión de Usuarios</h2>
        <div className="flex gap-2">
          {['todos', 'pendientes', 'activos', 'rechazados'].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${
                filtro === f
                  ? 'bg-kenya-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
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
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No se encontraron usuarios</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empresa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{u.nombre}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.empresa || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium uppercase ${ROLE_COLORS[u.rol] || 'bg-gray-100 text-gray-600'}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString('es-PE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {actionLoading === u.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                      ) : (
                        <>
                          {u.rol === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(u.id)}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                                title="Aprobar"
                              >
                                <UserCheck className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleReject(u.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                title="Rechazar"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {isSuperAdmin && u.rol !== 'superadmin' && u.rol !== 'pending' && (
                            <select
                              value={u.rol}
                              onChange={(e) => handleRoleChange(u.id, e.target.value)}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="user">user</option>
                              <option value="admin">admin</option>
                            </select>
                          )}
                        </>
                      )}
                    </div>
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
