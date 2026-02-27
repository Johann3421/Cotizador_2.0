import { useState, useEffect } from 'react';
import { getAdminStats } from '../../services/api';
import { Users, FileText, Database, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardIndex() {
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-kenya-600" />
      </div>
    );
  }

  const cards = [
    {
      label: 'Usuarios pendientes',
      value: stats?.pendingUsers || 0,
      icon: Clock,
      color: 'bg-yellow-50 text-yellow-600',
      link: '/admin/users',
    },
    {
      label: 'Usuarios activos',
      value: stats?.activeUsers || 0,
      icon: Users,
      color: 'bg-green-50 text-green-600',
      link: '/admin/users',
    },
    {
      label: 'Solicitudes pendientes',
      value: stats?.pendingRequests || 0,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      link: '/admin/quote-requests',
    },
    {
      label: 'Fichas en catálogo',
      value: stats?.totalProducts || 0,
      icon: Database,
      color: 'bg-purple-50 text-purple-600',
      link: '/admin/catalog',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                <p className="text-xs text-gray-400">{card.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
