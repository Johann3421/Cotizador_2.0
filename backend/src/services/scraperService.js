// src/services/scraperService.js
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA EN BASE DE DATOS LOCAL  (sin scraping, <100ms)
// Requiere que el catálogo esté sincronizado vía bulkScraperService
// ─────────────────────────────────────────────────────────────
const searchFichasByMarcaYTipo = async (marca, tipo = 'desktop', limit = 10) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products
       WHERE LOWER(marca) = LOWER($1)
         AND LOWER(categoria) = LOWER($2)
         AND (specs->>'estado' ILIKE '%ofertada%' OR specs->>'estado' = '' OR specs->>'estado' IS NULL)
       ORDER BY ultima_actualizacion DESC
       LIMIT $3`,
      [marca, tipo, limit]
    );
    return result.rows.map(row => ({
      fichaId:       row.ficha_id,
      nombre:        row.nombre,
      marcaDetectada: row.marca,
      numeroParte:   row.specs?.numeroParte || '',
      imgUrl:        row.specs?.imgUrl      || '',
      pdfUrl:        row.pdf_url || row.specs?.pdfUrl || '',
      specsFp:       row.specs?.specsFp     || '',
      specsObj:      row.specs?.specsObj    || {},
      estado:        row.specs?.estado      || '',
      catalogo:      row.specs?.catalogo    || '',
      categoria:     row.categoria          || tipo,
      fechaPub:      row.specs?.fechaPub    || '',
    }));
  } catch (e) {
    console.error('[Scraper] Error búsqueda DB ' + marca + '/' + tipo + ':', e.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA MULTI-MARCA CON SCORE DE COMPATIBILIDAD
// ─────────────────────────────────────────────────────────────
const searchCompatibleProducts = async (specs) => {
  const tipo   = (specs.tipo_equipo || 'desktop').toLowerCase();
  const MARCAS = ['kenya', 'lenovo', 'hp'];
  const result = {};

  // Verificar si hay datos en la DB
  const countResult = await pool.query(
    'SELECT COUNT(*) FROM products WHERE LOWER(categoria) = LOWER($1)', [tipo]
  ).catch(() => ({ rows: [{ count: '0' }] }));

  const totalEnDB = parseInt(countResult.rows[0]?.count || '0');

  if (totalEnDB === 0) {
    console.log('[Scraper] ⚠️  No hay fichas en DB para', tipo + '. Ejecutar POST /api/admin/sync primero.');
    return {
      _warning: 'NO_DATA',
      _message: 'El catálogo no ha sido sincronizado aún. Ejecutar POST /api/admin/sync',
      kenya: [], lenovo: [], hp: [],
    };
  }

  for (const marca of MARCAS) {
    const fichas = await searchFichasByMarcaYTipo(marca, tipo, 10);
    result[marca] = fichas
      .map(f => ({ ...f, score: calcularScore(f, specs) }))
      .sort((a, b) => b.score - a.score);
    console.log('[Scraper]', marca + '/' + tipo + ': ' + result[marca].length + ' fichas (top score: ' + (result[marca][0]?.score || 0) + ')');
  }

  return result;
};


// ─────────────────────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD — acepta "O SUPERIOR"
// ─────────────────────────────────────────────────────────────
const calcularScore = (ficha, req) => {
  let score = 0;
  const hay  = ((ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})).toLowerCase();
  const spOb = ficha.specsObj || {};

  // Procesador (30 pts)
  const modelosReq = (req.procesador?.modelo || '')
    .split(/[\/]|\bO\b|\bO SUPERIOR\b/i)
    .map(m => m?.trim().toLowerCase())
    .filter(Boolean);

  let procScore = 0;
  for (const mod of modelosReq) {
    if (hay.includes(mod)) { procScore = 30; break; }
    const fam = mod.match(/(ultra \d+|i[357]-?\d{4,5}[a-z]*|core \w+)/)?.[0];
    if (fam && hay.includes(fam)) procScore = Math.max(procScore, 22);
    else if (mod.includes('i7')    && hay.includes('i7'))    procScore = Math.max(procScore, 18);
    else if (mod.includes('i5')    && hay.includes('i5'))    procScore = Math.max(procScore, 12);
    else if (mod.includes('ultra') && hay.includes('ultra')) procScore = Math.max(procScore, 20);
  }
  score += procScore;

  // RAM (25 pts)
  const ramReq = req.memoria_ram?.capacidad_gb || 0;
  if (ramReq) {
    const ramFicha = extraerGb(spOb.ram || hay.match(/(\d+)\s*gb\s*(ddr|ram)/i)?.[0] || '');
    if (ramFicha >= ramReq) score += 25;
    else if (ramFicha > 0) score += Math.round((ramFicha / ramReq) * 15);
  }

  // Almacenamiento (20 pts)
  const stReq = req.almacenamiento?.capacidad_gb || 0;
  if (stReq) {
    const stText  = spOb.almacenamiento || '';
    const stFicha = hay.includes('1 tb') || hay.includes('1tb')
      ? 1000
      : extraerGb(stText || hay.match(/(\d+)\s*gb\s*ssd/i)?.[0] || '');
    if (stFicha >= stReq) score += 20;
    else if (stFicha > 0) score += Math.round((stFicha / stReq) * 12);
  }

  // SO (10 pts)
  const soReq = (req.sistema_operativo || '').toLowerCase();
  if (soReq.includes('windows') && hay.includes('windows')) score += 7;
  if (soReq.includes('11')      && hay.includes('11'))      score += 3;

  // Conectividad (10 pts)
  if (hay.includes('lan: si'))  score += 4;
  if (hay.includes('hdmi: si')) score += 3;
  if (hay.includes('usb: si'))  score += 3;

  // Estado OFERTADA bonus (5 pts)
  if ((ficha.estado || '').toLowerCase() === 'ofertada') score += 5;

  return Math.min(score, 100);
};

const extraerGb = (texto) => {
  const t = (texto || '').toLowerCase();
  const tb = t.match(/(\d+)\s*tb/);
  if (tb) return parseInt(tb[1]) * 1000;
  const gb = t.match(/(\d+)\s*gb/);
  return gb ? parseInt(gb[1]) : 0;
};

module.exports = { searchCompatibleProducts, searchFichasByMarcaYTipo };
