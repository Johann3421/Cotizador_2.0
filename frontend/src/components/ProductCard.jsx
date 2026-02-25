import { Check, X, ExternalLink, ShoppingCart } from 'lucide-react';

function ScoreBadge({ score }) {
  let colorClass = 'score-low';
  if (score >= 80) colorClass = 'score-high';
  else if (score >= 50) colorClass = 'score-medium';

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${colorClass}`}>
      {score}%
    </div>
  );
}

function ScoreBar({ score }) {
  let barColor = 'bg-red-500';
  if (score >= 80) barColor = 'bg-green-500';
  else if (score >= 50) barColor = 'bg-yellow-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${Math.min(score, 100)}%` }}
      />
    </div>
  );
}

function SpecCheck({ label, matches }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {matches ? (
        <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
      ) : (
        <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
      )}
      <span className={matches ? 'text-green-700' : 'text-gray-500'}>{label}</span>
    </div>
  );
}

const BRAND_STYLES = {
  kenya: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-600' },
  lenovo: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-600' },
  hp: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-cyan-600' },
};

export default function ProductCard({ product, requerimiento, onSelect, selected }) {
  const marca = (product.marca || 'otra').toLowerCase();
  const styles = BRAND_STYLES[marca] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', badge: 'bg-gray-600' };
  const specs = typeof product.specs === 'string' ? JSON.parse(product.specs) : (product.specs || product.parsed_specs || {});
  const score = product.score ?? 50;

  // Verificar specs contra requerimiento
  const specChecks = [];
  if (requerimiento?.procesador?.modelo) {
    const reqProc = (requerimiento.procesador.modelo || '').toLowerCase();
    const prodProc = JSON.stringify(specs.procesador || {}).toLowerCase();
    specChecks.push({ label: `Proc: ${requerimiento.procesador.modelo}`, matches: prodProc.includes(reqProc.split(' ')[0]) });
  }
  if (requerimiento?.memoria_ram?.capacidad_gb) {
    const prodRam = parseInt(specs.memoria_ram?.capacidad_gb) || 0;
    specChecks.push({ label: `RAM: ${requerimiento.memoria_ram.capacidad_gb}GB`, matches: prodRam >= requerimiento.memoria_ram.capacidad_gb });
  }
  if (requerimiento?.almacenamiento?.capacidad_gb) {
    const prodStorage = parseInt(specs.almacenamiento?.capacidad_gb) || 0;
    specChecks.push({ label: `Alm: ${requerimiento.almacenamiento.capacidad_gb}GB`, matches: prodStorage >= requerimiento.almacenamiento.capacidad_gb });
  }
  if (requerimiento?.grafica?.tipo) {
    specChecks.push({ label: `GPU: ${requerimiento.grafica.tipo}`, matches: (specs.grafica?.tipo || '').toLowerCase() === requerimiento.grafica.tipo.toLowerCase() });
  }
  if (requerimiento?.pantalla?.pulgadas) {
    const prodScreen = parseFloat(specs.pantalla?.pulgadas) || 0;
    specChecks.push({ label: `Pantalla: ${requerimiento.pantalla.pulgadas}"`, matches: Math.abs(prodScreen - requerimiento.pantalla.pulgadas) <= 1 });
  }

  return (
    <div className={`
      card transition-all duration-200 
      ${selected ? 'ring-2 ring-kenya-500 border-kenya-300' : ''}
      hover:shadow-md
    `}>
      {/* Header con marca */}
      <div className="flex items-center justify-between mb-3">
        <span className={`${styles.badge} text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase`}>
          {marca}
        </span>
        <ScoreBadge score={score} />
      </div>

      {/* Nombre */}
      <h4 className="font-semibold text-gray-800 text-sm leading-tight mb-2 line-clamp-2">
        {product.nombre || 'Producto sin nombre'}
      </h4>

      {/* Score bar */}
      <div className="mb-3">
        <ScoreBar score={score} />
        <p className="text-xs text-gray-400 mt-1">Coincidencia con requerimiento</p>
      </div>

      {/* Precio */}
      {product.precio_referencial && (
        <div className="mb-3 py-2 px-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400">Precio referencial</p>
          <p className="text-lg font-bold text-gray-800">
            S/. {parseFloat(product.precio_referencial).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </p>
        </div>
      )}

      {/* Spec checks */}
      {specChecks.length > 0 && (
        <div className="mb-3 space-y-1">
          {specChecks.map((check, i) => (
            <SpecCheck key={i} label={check.label} matches={check.matches} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => onSelect(product)}
          className={`
            flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium
            transition-all duration-200
            ${selected
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-kenya-600 text-white hover:bg-kenya-700'
            }
          `}
        >
          <ShoppingCart className="w-4 h-4" />
          {selected ? 'Seleccionado ✓' : 'Seleccionar'}
        </button>

        {product.url_ficha && (
          <a
            href={product.url_ficha}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Ver ficha en PeruCompras"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        )}
      </div>
    </div>
  );
}
