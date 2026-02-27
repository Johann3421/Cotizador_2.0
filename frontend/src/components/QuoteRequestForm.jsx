import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createQuoteRequest } from '../services/api';
import { Send, Loader2, CheckCircle } from 'lucide-react';

export default function QuoteRequestForm({ selectedProducts, requirementId }) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    nombre_contacto: user?.nombre || '',
    email_contacto: user?.email || '',
    telefono: user?.telefono || '',
    empresa: user?.empresa || '',
    notas: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createQuoteRequest({
        requirement_id: requirementId,
        ...form,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Error al enviar solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="card text-center py-12">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-800 mb-2">Solicitud enviada</h3>
        <p className="text-gray-500">
          Un administrador se pondrá en contacto contigo para completar tu cotización.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-bold text-gray-800 mb-1">Solicitar Cotización</h3>
      <p className="text-sm text-gray-500 mb-6">
        Completa tus datos de contacto y un administrador preparará tu cotización.
      </p>

      {selectedProducts?.length > 0 && (
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400 mb-2">Productos seleccionados:</p>
          <ul className="space-y-1">
            {selectedProducts.map((p, i) => (
              <li key={i} className="text-sm text-gray-700">
                • {p.nombre || p.ficha_tecnica || p.ficha_id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              name="nombre_contacto"
              required
              value={form.nombre_contacto}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kenya-500 focus:border-kenya-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              name="email_contacto"
              required
              value={form.email_contacto}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kenya-500 focus:border-kenya-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="tel"
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kenya-500 focus:border-kenya-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <input
              type="text"
              name="empresa"
              value={form.empresa}
              onChange={handleChange}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kenya-500 focus:border-kenya-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas adicionales</label>
          <textarea
            name="notas"
            rows={3}
            value={form.notas}
            onChange={handleChange}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-kenya-500 focus:border-kenya-500 outline-none resize-none"
            placeholder="Cantidades, plazo de entrega, condiciones especiales..."
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar Solicitud
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
