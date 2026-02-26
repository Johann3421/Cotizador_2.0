import { useState } from 'react';
import { Monitor, Laptop, MonitorSmartphone, Server, Edit3, Save, X } from 'lucide-react';

const TIPO_ICONS = {
  laptop: Laptop,
  desktop: Monitor,
  'all-in-one': MonitorSmartphone,
  workstation: Server,
};

const EsSuperior = ({ esMinimo }) =>
  esMinimo ? (
    <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
      o superior
    </span>
  ) : null;

export default function RequirementCard({ equipo, index, onUpdate, editable = true }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ ...equipo });

  const Icon = TIPO_ICONS[equipo.tipo_equipo] || Monitor;

  const handleSave = () => {
    onUpdate(index, editData);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditData({ ...equipo });
    setEditing(false);
  };

  const updateField = (path, value) => {
    setEditData((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let current = updated;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return updated;
    });
  };

  const SpecRow = ({ label, value, path, type = 'text', badge = null }) => {
    if (editing) {
      return (
        <div className="flex items-center gap-2 py-1">
          <span className="text-xs text-gray-500 w-28 shrink-0">{label}:</span>
          <input
            type={type}
            value={value ?? ''}
            onChange={(e) => updateField(path, type === 'number' ? Number(e.target.value) || null : e.target.value)}
            className="input-field text-xs py-1 px-2"
            placeholder="—"
          />
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-xs text-gray-500 w-28 shrink-0">{label}:</span>
        <span className="text-sm font-medium text-gray-800">{value || '—'}</span>
        {badge}
      </div>
    );
  };

  const data = editing ? editData : equipo;

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-kenya-100 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-kenya-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">
              Equipo #{index + 1}: {editing ? (
                <select
                  value={editData.tipo_equipo || 'laptop'}
                  onChange={(e) => updateField('tipo_equipo', e.target.value)}
                  className="input-field inline-block w-auto text-sm py-1"
                >
                  <option value="laptop">Laptop</option>
                  <option value="desktop">Desktop</option>
                  <option value="all-in-one">All-in-One</option>
                  <option value="workstation">Workstation</option>
                </select>
              ) : (
                <span className="capitalize">{data.tipo_equipo || 'laptop'}</span>
              )}
            </h3>
            <p className="text-xs text-gray-400">
              Cantidad: {editing ? (
                <input
                  type="number"
                  min="1"
                  value={editData.cantidad || 1}
                  onChange={(e) => updateField('cantidad', parseInt(e.target.value) || 1)}
                  className="input-field inline-block w-16 text-xs py-0.5 px-1"
                />
              ) : (
                data.cantidad || 1
              )}
            </p>
          </div>
        </div>

        {editable && (
          <div className="flex items-center gap-1">
            {editing ? (
              <>
                <button onClick={handleSave} className="p-2 hover:bg-green-50 rounded-lg" title="Guardar">
                  <Save className="w-4 h-4 text-green-600" />
                </button>
                <button onClick={handleCancel} className="p-2 hover:bg-red-50 rounded-lg" title="Cancelar">
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Editar"
              >
                <Edit3 className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Specs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
        {/* Procesador */}
        <div className="border-b border-gray-100 pb-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Procesador</p>
          <SpecRow label="Marca" value={data.procesador?.marca} path="procesador.marca" />
          {/* Modelos aceptados (puede ser array) */}
          <div className="flex items-start gap-2 py-0.5">
            <span className="text-xs text-gray-500 w-28 shrink-0">Modelos:</span>
            <div className="flex flex-wrap gap-1 items-center">
              {editing ? (
                <input
                  type="text"
                  value={(editData.procesador?.modelos_aceptados || [editData.procesador?.modelo_principal, editData.procesador?.modelo].filter(Boolean)).join(' / ')}
                  onChange={(e) => updateField('procesador.modelos_aceptados', e.target.value.split('/').map(s => s.trim()).filter(Boolean))}
                  className="input-field text-xs py-1 px-2"
                  placeholder="Modelo principal"
                />
              ) : (
                (data.procesador?.modelos_aceptados || [data.procesador?.modelo_principal, data.procesador?.modelo].filter(Boolean)).map((m, i) => (
                  <span key={i} className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded text-gray-800">{m}</span>
                ))
              )}
              <EsSuperior esMinimo={data.procesador?.es_minimo} />
            </div>
          </div>
          <SpecRow label="Generación" value={data.procesador?.generacion_principal || data.procesador?.generacion} path="procesador.generacion_principal" />
        </div>

        {/* Memoria */}
        <div className="border-b border-gray-100 pb-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Memoria RAM</p>
          <SpecRow label="Capacidad (GB)" value={data.memoria_ram?.capacidad_gb} path="memoria_ram.capacidad_gb" type="number" badge={<EsSuperior esMinimo={data.memoria_ram?.es_minimo} />} />
          <SpecRow label="Tipo" value={data.memoria_ram?.tipo} path="memoria_ram.tipo" />
        </div>

        {/* Almacenamiento — soporta array de unidades */}
        <div className="border-b border-gray-100 pb-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Almacenamiento</p>
          {(Array.isArray(data.almacenamiento) ? data.almacenamiento : [data.almacenamiento].filter(Boolean)).map((st, idx) => (
            <div key={idx} className="flex items-center gap-2 py-0.5">
              <span className="text-xs text-gray-500 w-28 shrink-0">
                {Array.isArray(data.almacenamiento) && data.almacenamiento.length > 1 ? `Unidad ${idx + 1}` : 'Capacidad'}
              </span>
              {editing ? (
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    value={st?.capacidad_gb ?? ''}
                    onChange={(e) => {
                      const arr = Array.isArray(editData.almacenamiento) ? [...editData.almacenamiento] : [editData.almacenamiento || {}];
                      arr[idx] = { ...arr[idx], capacidad_gb: Number(e.target.value) || null };
                      updateField('almacenamiento', arr);
                    }}
                    className="input-field text-xs py-1 px-2 w-24"
                    placeholder="GB"
                  />
                  <select
                    value={st?.tipo || ''}
                    onChange={(e) => {
                      const arr = Array.isArray(editData.almacenamiento) ? [...editData.almacenamiento] : [editData.almacenamiento || {}];
                      arr[idx] = { ...arr[idx], tipo: e.target.value };
                      updateField('almacenamiento', arr);
                    }}
                    className="input-field text-xs py-1 px-2"
                  >
                    <option value="NVMe SSD">NVMe SSD</option>
                    <option value="SSD">SSD</option>
                    <option value="HDD">HDD</option>
                    <option value="HDD 7200rpm">HDD 7200rpm</option>
                    <option value="eMMC">eMMC</option>
                  </select>
                </div>
              ) : (
                <span className="text-sm font-medium text-gray-800">
                  {st?.capacidad_gb ? `${st.capacidad_gb} GB` : '—'}
                  {st?.tipo && <span className="ml-1 text-xs text-gray-500">({st.tipo})</span>}
                  {st?.es_minimo && <EsSuperior esMinimo={true} />}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Pantalla — ocultar si es desktop o workstation */}
        {data.tipo_equipo !== 'desktop' && data.tipo_equipo !== 'workstation' && (
          <div className="border-b border-gray-100 pb-2 mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Pantalla</p>
            <SpecRow label="Pulgadas" value={data.pantalla?.pulgadas} path="pantalla.pulgadas" type="number" />
            <SpecRow label="Resolución" value={data.pantalla?.resolucion} path="pantalla.resolucion" />
          </div>
        )}

        {/* Gráfica */}
        <div className="border-b border-gray-100 pb-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Gráfica</p>
          <div className="flex items-center gap-2 py-0.5">
            <span className="text-xs text-gray-500 w-28 shrink-0">Tipo:</span>
            {editing ? (
              <select
                value={editData.grafica?.tipo || 'integrada'}
                onChange={(e) => updateField('grafica.tipo', e.target.value)}
                className="input-field text-xs py-1 px-2"
              >
                <option value="integrada">Integrada</option>
                <option value="dedicada">Dedicada</option>
              </select>
            ) : (
              <span className="text-sm font-medium text-gray-800">
                {data.grafica?.tipo === 'integrada' ? '🔵 Gráficos Integrados' : data.grafica?.tipo === 'dedicada' ? '🟠 Dedicada' : '—'}
                {data.grafica?.opcional_dedicada && (
                  <span className="ml-1.5 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                    GPU dedicada: opcional
                  </span>
                )}
              </span>
            )}
          </div>
          {data.grafica?.tipo === 'dedicada' && (
            <>
              <SpecRow label="VRAM (GB)" value={data.grafica?.vram_gb} path="grafica.vram_gb" type="number" />
              <SpecRow label="Modelo" value={data.grafica?.modelo} path="grafica.modelo" />
            </>
          )}
        </div>

        {/* Otros */}
        <div className="border-b border-gray-100 pb-2 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Otros</p>
          <SpecRow label="Sistema Op." value={data.sistema_operativo} path="sistema_operativo" />
          <SpecRow label="Uso" value={data.uso} path="uso" />
        </div>
      </div>

      {/* Otros features */}
      {data.otros && data.otros.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.otros.map((item, i) => (
            <span key={i} className="badge badge-gray text-xs">{item}</span>
          ))}
        </div>
      )}
    </div>
  );
}
