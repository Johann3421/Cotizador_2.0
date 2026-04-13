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

function SpecCheck({ label, status = 'miss', details = '' }) {
  // status: 'ok' | 'better' | 'miss' | 'partial'
  const icon = status === 'ok' ? (
    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
  ) : status === 'better' || status === 'partial' ? (
    <Check className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
  ) : (
    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
  );

  const textClass = status === 'ok' ? 'text-green-700' : status === 'better' || status === 'partial' ? 'text-yellow-700' : 'text-gray-500';

  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className={textClass}>{label}</span>
      </div>
      {details ? <div className="text-xs text-gray-400 mt-1 ml-6">{details}</div> : null}
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

  // Usar specs del PDF extraído → pdfSpecs.specs
  const pdfSpecs = product.pdfSpecs?.specs || {};
  const score = product.score ?? 50;

  // Comparar specs reales extraídas del PDF con el requerimiento
  // El requerimiento viene del AIService con estructura: memoria_ram.capacidad_gb, grafica.tipo, etc.
  const specChecks = [];

  // RAM: comparar capacidad (de estructura anidada de AIService)
  if (requerimiento?.memoria_ram?.capacidad_gb !== undefined) {
    const reqRamGb = parseInt(requerimiento.memoria_ram.capacidad_gb);
    const prodRamGb = pdfSpecs.ram_gb ? parseInt(pdfSpecs.ram_gb) : 0;
    let status = 'miss';
    if (prodRamGb >= reqRamGb) status = prodRamGb > reqRamGb ? 'better' : 'ok';
    specChecks.push({ label: `RAM: ${reqRamGb}GB`, status });
  }

  // GPU: comparar tipo (integrada vs dedicada)
  if (requerimiento?.grafica) {
    const reqGpuType = (requerimiento.grafica.tipo || '').toLowerCase();
    const reqVram = parseInt(requerimiento.grafica?.vram_gb || 0);
    const prodGpuType = (pdfSpecs.grafica_tipo || '').toLowerCase();
    const prodVram = parseInt(pdfSpecs.grafica_vram_gb || 0);
    let status = 'miss';
    if (!reqGpuType) status = 'ok';
    else if (reqGpuType === 'integrada') {
      // cualquier GPU cumple; dedicated is better
      if (prodGpuType === 'dedicada') status = 'better';
      else if (prodGpuType === 'integrada') status = 'ok';
    } else if (reqGpuType === 'dedicada') {
      if (prodGpuType === 'dedicada') {
        if (prodVram >= reqVram && prodVram > reqVram) status = 'better';
        else if (prodVram >= reqVram) status = 'ok';
        else status = 'miss';
      } else {
        status = 'miss';
      }
    }
    const label = reqVram > 0 ? `GPU: ${reqGpuType} ${reqVram ? reqVram + 'GB' : ''}` : `GPU: ${reqGpuType}`;
    specChecks.push({ label, status, details: prodVram ? `Ficha: ${prodVram}GB ${prodGpuType}` : `Ficha: ${prodGpuType || 'sin info'}` });
  }

  // Almacenamiento: verificar que tenga capacidad suficiente (array structure)
  // Almacenamiento: comparar lista de requerimientos vs unidades encontradas
  if (requerimiento?.almacenamiento && Array.isArray(requerimiento.almacenamiento) && requerimiento.almacenamiento.length > 0) {
    const reqList = requerimiento.almacenamiento.map(r => ({ gb: parseInt(r.capacidad_gb || 0), tipo: (r.tipo || '').toLowerCase() }));
    const prodList = (pdfSpecs.almacenamiento || []).map(p => ({ gb: parseInt(p.gb || 0), tipo: (p.tipo || '').toLowerCase() }));

    // función orden tipo
    const rankTipo = (t) => {
      if (!t) return 0;
      if (/nvme/i.test(t)) return 3;
      if (/ssd/i.test(t)) return 2;
      if (/hdd/i.test(t)) return 1;
      return 0;
    };

    const used = new Array(prodList.length).fill(false);
    let matched = 0;
    let anyBetter = false;
    const missing = [];

    for (const req of reqList) {
      let foundIndex = -1;
      // Primera pasada: preferir unidad que cumpla tipo y tamaño
      for (let i = 0; i < prodList.length; i++) {
        if (used[i]) continue;
        const p = prodList[i];
        if (p.gb >= req.gb && rankTipo(p.tipo) >= rankTipo(req.tipo)) { foundIndex = i; break; }
      }
      // Segunda pasada: aceptar por capacidad aunque tipo sea inferior (marcar partial)
      let typeMismatch = false;
      if (foundIndex === -1) {
        for (let i = 0; i < prodList.length; i++) {
          if (used[i]) continue;
          const p = prodList[i];
          if (p.gb >= req.gb) { foundIndex = i; typeMismatch = true; break; }
        }
      }

      if (foundIndex >= 0) {
        used[foundIndex] = true; matched++;
        const p = prodList[foundIndex];
        if (p.gb > req.gb || rankTipo(p.tipo) > rankTipo(req.tipo)) anyBetter = true;
        if (typeMismatch) {
          // record mismatch as partial by adding note to missing (but still matched)
          // we'll surface this via details later
        }
      } else {
        missing.push(`${req.gb}GB ${req.tipo || 'SSD/HDD'}`);
      }
    }

    let status = 'miss';
    if (matched === reqList.length) status = anyBetter ? 'better' : 'ok';
    else if (matched > 0) status = 'partial';

    const label = `Almacenamiento: ${matched}/${reqList.length}`;
    const details = missing.length > 0 ? `Faltan: ${missing.join(', ')}` : `Unidades: ${prodList.map(p => p.gb + 'GB').join(', ')}`;
    specChecks.push({ label, status, details });
  }

  // ── Helpers de CPU (definidos aquí para estar disponibles en el bloque) ──────
  const parseCpu = (txt) => {
    if (!txt) return null;
    const t = txt.toLowerCase();
    // Core Ultra: rawGen basado en serie (2xx → S2=16, 1xx → S1=15)
    if (/ultra/i.test(t)) {
      const fam = (t.match(/ultra\s*([579])/) || [null, ''])[1] || '7';
      const modelNum = t.match(/ultra\s*[579]\s+(\d{3,5})/i);
      let raw = 16;
      if (modelNum) { const n = parseInt(modelNum[1]); raw = n >= 200 ? 16 : 15; }
      return { arch: 'intel', family: `ultra ${fam}`, rawGen: raw };
    }
    // Intel clásico i3/i5/i7/i9
    const intel = t.match(/(?:core\s+)?i([3579])[\s-]*(\d{2,5})/i);
    if (intel) {
      const fam = `i${intel[1]}`;
      const num = (intel[2] || '').toString();
      const raw = num.length >= 2 ? parseInt(num.slice(0, 2)) : undefined;
      return { arch: 'intel', family: fam, rawGen: raw };
    }
    // AMD Ryzen
    const amd = t.match(/ryzen\s*([3579])\D*(\d{2,5})/i) || t.match(/ryzen\s*(\d{2,5})/i);
    if (amd) {
      const fam = amd[1] ? `ryzen ${amd[1]}` : 'ryzen';
      const num = (amd[2] || '').toString();
      const raw = num.length >= 2 ? parseInt(num.slice(0, 2)) : undefined;
      return { arch: 'amd', family: fam, rawGen: raw };
    }
    const num = t.match(/(\d{2,3})/);
    if (num) return { arch: 'unknown', family: 'unknown', rawGen: parseInt(num[1].slice(0, 2)) };
    return null;
  };

  const rank = (fam) => {
    if (!fam) return 0;
    const f = fam.toLowerCase();
    if (f.startsWith('ultra 9')) return 10;
    if (f.startsWith('ultra 7')) return 8;
    if (f.startsWith('ultra 5')) return 6;
    if (f.startsWith('ultra'))   return 7;
    if (f.startsWith('i9'))      return 9;
    if (f.startsWith('i7'))      return 7;
    if (f.startsWith('i5'))      return 5;
    if (f.startsWith('i3'))      return 4;
    if (f.startsWith('ryzen 9')) return 9;
    if (f.startsWith('ryzen 7')) return 7;
    if (f.startsWith('ryzen 5')) return 5;
    return 3;
  };

  // Procesador: comparar contra TODOS los modelos aceptados (OR logic)
  if (requerimiento?.procesador?.modelo_principal) {
    const reqModels = [
      requerimiento.procesador.modelo_principal,
      ...(requerimiento.procesador.modelos_aceptados || []),
    ].filter((m, i, arr) => Boolean(m) && arr.indexOf(m) === i);

    const prodTxt = (pdfSpecs.procesador_modelo || pdfSpecs.procesador_texto || product.procesador || '').toLowerCase();
    const prodCpu = parseCpu(prodTxt);

    // Función que compara prodCpu vs un texto de modelo de requisito
    const scoreVsReq = (reqTxt) => {
      const reqCpu = parseCpu(reqTxt.toLowerCase());
      if (!reqCpu) return 'ok';
      if (!prodCpu) return 'partial';

      const reqRaw  = reqCpu.rawGen  || 0;
      const prodRaw = prodCpu.rawGen || 0;

      // Arquitecturas distintas (Intel vs AMD) → no declarar miss automáticamente
      if (reqCpu.arch !== prodCpu.arch && reqCpu.arch !== 'unknown' && prodCpu.arch !== 'unknown') {
        if (prodRaw && reqRaw && prodRaw > reqRaw) return 'better';
        return 'partial';
      }

      if (prodRaw && reqRaw) {
        if (prodRaw < reqRaw) return 'miss';
        if (prodRaw === reqRaw) {
          const dr = rank(prodCpu.family) - rank(reqCpu.family);
          return dr > 0 ? 'better' : dr === 0 ? 'ok' : 'partial';
        }
        // prodRaw > reqRaw
        const dr = rank(prodCpu.family) - rank(reqCpu.family);
        return dr >= 0 ? 'better' : 'partial';
      }
      // sin rawGen disponible → usar sólo rank de familia
      const dr = rank(prodCpu.family) - rank(reqCpu.family);
      return dr > 0 ? 'better' : dr === 0 ? 'ok' : 'partial';
    };

    const statusPriority = { better: 3, ok: 2, partial: 1, miss: 0 };
    let bestStatus = 'miss';
    let matchedModel = null;
    for (const model of reqModels) {
      const s = scoreVsReq(model);
      if (statusPriority[s] > statusPriority[bestStatus]) {
        bestStatus = s;
        matchedModel = model;
      }
    }

    const displayLabel = `Proc: ${requerimiento.procesador.modelo_principal}`;
    const details = prodCpu
      ? bestStatus !== 'miss'
        ? `${prodCpu.family} gen ${prodCpu.rawGen || 'N/A'} ≥ ${matchedModel}`
        : `${prodCpu.family} gen ${prodCpu.rawGen || 'N/A'}`
      : 'Ficha: sin info';
    specChecks.push({ label: displayLabel, status: bestStatus, details });
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
      {/* Número de parte (si existe) */}
      {(() => {
        const partNumber = product.numeroParte || product.numero_parte || product.part_number || product.partNumber || product.part || product.partNo || product.partno || product.parte;
        return partNumber ? (
          <div className="text-sm text-gray-700 mb-2 font-medium">
            <span className="text-gray-500">N° de parte: </span>
            <span className="font-mono">{partNumber}</span>
          </div>
        ) : null;
      })()}

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
            <SpecCheck key={i} label={check.label} status={check.status} details={check.details} />
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

        {/* Botón PDF de especificación técnica (contiene todas las specs incluyendo gráficos) */}
        {product.pdfUrl ? (
          <a
            href={product.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
            title="Ver especificación técnica completa (PDF)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                 viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                 className="text-red-500">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
            <span className="text-xs text-red-500 font-medium">Ficha técnica</span>
          </a>
        ) : (
          <a
            href="https://buscadorcatalogos.perucompras.gob.pe/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Ver en PeruCompras"
          >
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        )}
      </div>
    </div>
  );
}
