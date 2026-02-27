import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { getNotifications, getUnreadCount, markNotificationsRead } from '../services/api';

export default function NotificationBell() {
  const [open, setOpen]       = useState(false);
  const [count, setCount]     = useState(0);
  const [items, setItems]     = useState([]);
  const ref = useRef(null);

  // Polling unread count
  useEffect(() => {
    const fetchCount = () => {
      getUnreadCount().then((d) => setCount(d.count)).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = async () => {
    if (!open) {
      try {
        const data = await getNotifications();
        setItems(data);
      } catch { /* ignore */ }
    }
    setOpen(!open);
  };

  const handleMarkRead = async () => {
    try {
      await markNotificationsRead();
      setCount(0);
      setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-gray-800 text-sm">Notificaciones</span>
            {count > 0 && (
              <button onClick={handleMarkRead} className="text-xs text-kenya-600 hover:underline">
                Marcar como leídas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                Sin notificaciones
              </div>
            ) : (
              items.map((n) => (
                <div key={n.id} className={`px-4 py-3 text-sm ${n.leida ? 'bg-white' : 'bg-blue-50'}`}>
                  <p className="font-medium text-gray-800">{n.titulo}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{n.mensaje}</p>
                  <p className="text-gray-300 text-[10px] mt-1">
                    {new Date(n.created_at).toLocaleString('es-PE')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
