import { useAuth } from '../context/AuthContext';
import { Clock, LogOut } from 'lucide-react';

export default function PendingApproval() {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
        <Clock className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Cuenta pendiente de aprobación</h2>
        <p className="text-gray-500 mb-2">
          {user?.nombre ? `Hola ${user.nombre}, tu` : 'Tu'} cuenta está siendo revisada por un administrador.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Recibirás un email cuando tu cuenta sea aprobada. Esto suele tardar menos de 24 horas.
        </p>
        <button onClick={logout} className="btn-secondary flex items-center gap-2 mx-auto">
          <LogOut className="w-4 h-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
