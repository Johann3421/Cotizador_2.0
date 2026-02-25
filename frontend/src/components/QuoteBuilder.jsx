import { useState } from 'react';
import { Trash2, Plus, AlertCircle } from 'lucide-react';

export default function QuoteBuilder({ selectedProducts, onSubmit, loading }) {
  const [cliente, setCliente] = useState('');
  const [ruc, setRuc] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState(
    selectedProducts.map((p) => ({
      product_id: p.id || p.ficha_id,
      nombre: p.nombre,
      marca: p.marca || '',
      procesador: p.specs?.procesador?.modelo || p.parsed_specs?.procesador?.modelo || '',
      ram: p.specs?.memoria_ram?.capacidad_gb ? `${p.specs.memoria_ram.capacidad_gb}GB` : '',
      almacenamiento: p.specs?.almacenamiento?.capacidad_gb ? `${p.specs.almacenamiento.capacidad_gb}GB ${p.specs.almacenamiento.tipo || ''}` : '',
      cantidad: 1,
      precio_unitario: parseFloat(p.precio_referencial) || 0,
    }))
  );

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { product_id: null, nombre: '', marca: '', procesador: '', ram: '', almacenamiento: '', cantidad: 1, precio_unitario: 0 },
    ]);
  };

  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const formatCurrency = (amount) =>
    `S/. ${parseFloat(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSubmit = () => {
    if (!cliente.trim()) {
      alert('Ingresa el nombre del cliente');
      return;
    }
    if (items.length === 0) {
      alert('Agrega al menos un item a la cotización');
      return;
    }
    onSubmit({ cliente, ruc, items, notas });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Datos del cliente */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Datos del Cliente</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Nombre del Cliente *
            </label>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              className="input-field"
              placeholder="Ej: Municipalidad de Lima"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              RUC (opcional)
            </label>
            <input
              type="text"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              className="input-field"
              placeholder="Ej: 20100000000"
              maxLength={11}
            />
          </div>
        </div>
      </div>

      {/* Items de la cotización */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Items de la Cotización</h3>
          <button onClick={addItem} className="btn-ghost flex items-center gap-1 text-sm">
            <Plus className="w-4 h-4" /> Agregar item
          </button>
        </div>

        {items.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p>No hay items. Agrega productos a la cotización.</p>
          </div>
        )}

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200 animate-fade-in">
              <div className="flex items-start gap-3">
                <span className="text-sm font-bold text-gray-400 mt-2">{index + 1}</span>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs text-gray-500 mb-0.5">Descripción</label>
                    <input
                      type="text"
                      value={item.nombre}
                      onChange={(e) => updateItem(index, 'nombre', e.target.value)}
                      className="input-field text-sm"
                      placeholder="Nombre del producto"
                    />
                    {(item.procesador || item.ram || item.almacenamiento) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {[item.procesador, item.ram, item.almacenamiento].filter(Boolean).join(' | ')}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Marca</label>
                    <input
                      type="text"
                      value={item.marca}
                      onChange={(e) => updateItem(index, 'marca', e.target.value)}
                      className="input-field text-sm"
                      placeholder="Marca"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Cantidad</label>
                    <input
                      type="number"
                      min="1"
                      value={item.cantidad}
                      onChange={(e) => updateItem(index, 'cantidad', parseInt(e.target.value) || 1)}
                      className="input-field text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Precio Unit.</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.precio_unitario}
                      onChange={(e) => updateItem(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                      className="input-field text-sm"
                    />
                  </div>
                </div>

                <button
                  onClick={() => removeItem(index)}
                  className="p-1.5 hover:bg-red-50 rounded-lg mt-5"
                  title="Eliminar item"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notas */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-3">Notas adicionales</h3>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          className="input-field min-h-[80px] resize-y"
          placeholder="Observaciones, condiciones especiales, etc."
        />
      </div>

      {/* Resumen de totales */}
      <div className="card bg-gray-900 text-white">
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-8 text-sm">
            <span className="text-gray-400">Subtotal:</span>
            <span className="font-medium w-32 text-right">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center gap-8 text-sm">
            <span className="text-gray-400">IGV (18%):</span>
            <span className="font-medium w-32 text-right">{formatCurrency(igv)}</span>
          </div>
          <div className="flex items-center gap-8 text-lg font-bold pt-2 border-t border-gray-700">
            <span>TOTAL:</span>
            <span className="w-32 text-right text-kenya-400">{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {/* Botón submit */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || !cliente.trim() || items.length === 0}
          className="btn-primary text-lg px-8 py-3"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generando...
            </span>
          ) : (
            'Generar Cotización'
          )}
        </button>
      </div>
    </div>
  );
}
