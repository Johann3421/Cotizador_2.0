import { FileDown, CheckCircle2, Printer } from 'lucide-react';
import { getQuotePDFUrl } from '../services/api';

export default function QuotePreview({ quote }) {
  if (!quote) return null;

  const items = typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []);

  const formatCurrency = (amount) =>
    `S/. ${parseFloat(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fecha = new Date(quote.created_at).toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const estadoBadge = {
    borrador: 'badge-yellow',
    enviada: 'badge-blue',
    aprobada: 'badge-green',
  };

  return (
    <div className="animate-fade-in">
      {/* Success message */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
        <div>
          <p className="font-medium text-green-800">¡Cotización generada exitosamente!</p>
          <p className="text-sm text-green-600">N° {quote.numero_cotizacion}</p>
        </div>
      </div>

      {/* Preview card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-kenya-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">KENYA</h2>
              <p className="text-kenya-200 text-sm">Distribuidora de Tecnología</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{quote.numero_cotizacion}</p>
              <p className="text-kenya-200 text-sm">{fecha}</p>
              <span className={`badge ${estadoBadge[quote.estado] || 'badge-gray'} mt-1`}>
                {(quote.estado || 'borrador').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Client info */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-500">Cliente</p>
          <p className="font-semibold text-gray-800 text-lg">{quote.cliente}</p>
          {quote.ruc && <p className="text-sm text-gray-500">RUC: {quote.ruc}</p>}
        </div>

        {/* Items table */}
        <div className="p-6">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Item</th>
                <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase">Cant.</th>
                <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">P. Unitario</th>
                <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const cantidad = parseInt(item.cantidad) || 1;
                const precio = parseFloat(item.precio_unitario) || 0;
                return (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 text-sm text-gray-500">{index + 1}</td>
                    <td className="py-3">
                      <p className="text-sm font-medium text-gray-800">{item.nombre}</p>
                      {(item.procesador || item.ram || item.almacenamiento) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[item.procesador, item.ram, item.almacenamiento].filter(Boolean).join(' | ')}
                        </p>
                      )}
                      {item.marca && (
                        <span className="text-xs text-gray-400">Marca: {item.marca}</span>
                      )}
                    </td>
                    <td className="py-3 text-sm text-center text-gray-700">{cantidad}</td>
                    <td className="py-3 text-sm text-right text-gray-700">{formatCurrency(precio)}</td>
                    <td className="py-3 text-sm text-right font-medium text-gray-800">
                      {formatCurrency(cantidad * precio)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 pt-4 border-t-2 border-gray-200">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">IGV (18%):</span>
                  <span className="font-medium">{formatCurrency(quote.igv)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
                  <span>TOTAL:</span>
                  <span className="text-kenya-600">{formatCurrency(quote.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div className="px-6 pb-6">
          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-600 mb-2">Condiciones:</p>
            <p>• Los precios son referenciales según catálogo de PeruCompras.</p>
            <p>• Esta cotización tiene una validez de 7 días calendario.</p>
            <p>• Precios incluyen IGV.</p>
            <p>• Disponibilidad sujeta a stock al momento de la orden de compra.</p>
            {quote.notas && (
              <>
                <p className="font-semibold text-gray-600 mt-3 mb-1">Notas:</p>
                <p>{quote.notas}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3 mt-6">
        <a
          href={getQuotePDFUrl(quote.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary flex items-center gap-2"
        >
          <FileDown className="w-4 h-4" /> Descargar PDF
        </a>
        <button
          onClick={() => window.print()}
          className="btn-secondary flex items-center gap-2"
        >
          <Printer className="w-4 h-4" /> Imprimir
        </button>
      </div>
    </div>
  );
}
