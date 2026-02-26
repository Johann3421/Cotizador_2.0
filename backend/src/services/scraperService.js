// src/services/scraperService.js
'use strict';

const { chromium } = require('playwright');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';

// Términos de búsqueda exactos para cada combinación tipo+marca
const TERMINOS_BUSQUEDA = {
  desktop: {
    kenya:  'computadora de escritorio kenya',
    lenovo: 'computadora de escritorio lenovo',
    hp:     'computadora de escritorio hp',
  },
  laptop: {
    kenya:  'computadora portatil kenya',
    lenovo: 'computadora portatil lenovo',
    hp:     'computadora portatil hp',
  },
  'all-in-one': {
    kenya:  'computadora all in one kenya',
    lenovo: 'computadora all in one lenovo',
    hp:     'computadora all in one hp',
  },
};

// Tiempo de espera en ms después de hacer la búsqueda para que cargue el DOM
const WAIT_AFTER_SEARCH_MS = 4000;
// Tiempo entre búsquedas de marcas distintas (rate limiting)
const DELAY_BETWEEN_BRANDS_MS = 2000;


// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE BÚSQUEDA
// ─────────────────────────────────────────────
/**
 * Busca fichas en PeruCompras para una marca y tipo de equipo específicos.
 * @param {string} marca   - 'kenya' | 'lenovo' | 'hp'
 * @param {string} tipo    - 'desktop' | 'laptop' | 'all-in-one'
 * @param {number} limit   - máximo de fichas a retornar (default 10)
 * @returns {Array}        - Array de objetos ficha con todos sus datos
 */
const searchFichasByMarcaYTipo = async (marca, tipo = 'desktop', limit = 10) => {
  // 1. Revisar caché en base de datos (fichas de menos de 24h)
  const cached = await getCachedFichas(marca, tipo, limit);
  if (cached.length > 0) {
    console.log(`[Scraper] Cache hit: ${cached.length} fichas de ${marca} (${tipo})`);
    return cached;
  }

  const terminoBusqueda = (TERMINOS_BUSQUEDA[tipo] || TERMINOS_BUSQUEDA['desktop'])[marca];
  if (!terminoBusqueda) {
    console.error(`[Scraper] No hay término de búsqueda para tipo=${tipo} marca=${marca}`);
    return [];
  }

  console.log(`[Scraper] Buscando en PeruCompras: "${terminoBusqueda}"`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    await page.goto(BUSCADOR_URL, { waitUntil: 'networkidle', timeout: 45000 });
    console.log('[Scraper] Página cargada');

    const INPUT_SELECTORS = [
      'input[placeholder*="letras"]',
      'input[placeholder*="Buscar"]',
      'input[placeholder*="buscar"]',
      'input[placeholder*="producto"]',
      'input[type="search"]',
      'input[type="text"]:visible',
    ];

    let searchInput = null;
    for (const sel of INPUT_SELECTORS) {
      searchInput = await page.$(sel);
      if (searchInput) {
        console.log(`[Scraper] Input encontrado con selector: ${sel}`);
        break;
      }
    }

    if (!searchInput) {
      await page.screenshot({ path: '/tmp/scraper-debug.png' });
      throw new Error('No se encontró el input de búsqueda. Ver /tmp/scraper-debug.png');
    }

    await searchInput.fill(terminoBusqueda);
    await page.waitForTimeout(500);
    await searchInput.press('Enter');

    await page.waitForTimeout(WAIT_AFTER_SEARCH_MS);
    await page.waitForSelector('.enlace-detalles', { timeout: 15000 })
      .catch(() => console.log('[Scraper] Advertencia: .enlace-detalles no apareció en 15s'));

    const fichas = await page.$$eval(
      'a.enlace-detalles',
      (elements, limit) => {
        return elements.slice(0, limit).map(el => {
          const fichaId     = el.id || '';
          const nombre      = el.closest('.card')?.querySelector('.card-title-custom')?.innerText?.trim() || '';
          const numeroParte = el.closest('.card')?.querySelector('.card-title b')?.innerText?.trim() || '';
          const imgUrl      = el.dataset.img || '';
          const pdfUrl      = el.dataset.file || '';
          const specsFp     = el.dataset.fp || '';
          const specsHtml   = el.dataset.feature || '';
          const estado      = el.dataset.status || '';
          const catalogo    = el.dataset.catalogue || '';
          const categoria   = el.dataset.category || '';
          const acuerdo     = el.dataset.agreement || '';
          const fechaPub    = el.dataset.publishedDate || '';
          const fechaUpd    = el.dataset.updatedDate || '';

          const specsObj = {};
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = specsHtml;
          tempDiv.querySelectorAll('li').forEach(li => {
            const texto = li.innerText?.trim() || '';
            const colonIdx = texto.indexOf(':');
            if (colonIdx > -1) {
              const key = texto.substring(0, colonIdx).trim().toLowerCase();
              const val = texto.substring(colonIdx + 1).trim();
              specsObj[key] = val;
            }
          });

          const parseTextSpecs = (text) => {
            const result = {};
            const patterns = [
              { key: 'procesador',     regex: /PROCESADOR:\s*([^R][^\n]+?)(?:\s+RAM:|$)/i },
              { key: 'ram',            regex: /RAM:\s*([^\n]+?)(?:\s+ALMACENAMIENTO:|$)/i },
              { key: 'almacenamiento', regex: /ALMACENAMIENTO:\s*([^\n]+?)(?:\s+LAN:|$)/i },
              { key: 'so',             regex: /SIST\.\s*OPER[.:]?\s*([^\n]+?)(?:\s+UNIDAD|$)/i },
              { key: 'garantia',       regex: /G\.\s*F[.:]?\s*([^\n]+?)(?:\s+CARRY|$)/i },
            ];
            patterns.forEach(({ key, regex }) => {
              const match = text.match(regex);
              if (match) result[key] = match[1].trim();
            });
            return result;
          };

          return {
            fichaId, nombre, numeroParte, imgUrl,
            pdfUrl,
            specsFp, specsObj,
            specsTexto: parseTextSpecs(specsFp),
            estado, catalogo, categoria, acuerdo,
            fechaPublicacion: fechaPub,
            fechaActualizacion: fechaUpd,
            urlBuscador: 'https://buscadorcatalogos.perucompras.gob.pe/',
          };
        });
      },
      limit
    );

    console.log(`[Scraper] Extraídas ${fichas.length} fichas de ${marca}`);

    if (fichas.length > 0) {
      await saveFichasToCache(fichas, marca, tipo);
    }

    return fichas;

  } catch (error) {
    console.error(`[Scraper] Error buscando ${marca} ${tipo}:`, error.message);
    return [];
  } finally {
    await browser.close();
  }
};


// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL EXPORTADA
// ─────────────────────────────────────────────
const searchCompatibleProducts = async (specs) => {
  const tipo = specs.tipo_equipo || 'desktop';
  const resultados = {};
  const MARCAS = ['kenya', 'lenovo', 'hp'];

  for (const marca of MARCAS) {
    try {
      const fichas = await searchFichasByMarcaYTipo(marca, tipo, 10);
      resultados[marca] = fichas
        .map(f => ({ ...f, score: calcularScore(f, specs) }))
        .sort((a, b) => b.score - a.score);
    } catch (e) {
      console.error(`[Scraper] Error en ${marca}:`, e.message);
      resultados[marca] = [];
    }
    await delay(DELAY_BETWEEN_BRANDS_MS);
  }

  return resultados;
};


// ─────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD
// ─────────────────────────────────────────────
const calcularScore = (ficha, requerimiento) => {
  let score = 0;
  const haystack = (
    (ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})
  ).toLowerCase();

  const proc = requerimiento.procesador?.modelo?.toLowerCase() || '';
  if (proc && haystack.includes(proc)) score += 30;
  else if (proc.includes('ultra') && haystack.includes('ultra')) score += 20;
  else if (proc.includes('i7') && haystack.includes('i7')) score += 15;
  else if (proc.includes('i5') && haystack.includes('i5')) score += 10;

  const ramGb = requerimiento.memoria_ram?.capacidad_gb;
  if (ramGb) {
    if (haystack.includes(`${ramGb} gb`) || haystack.includes(`${ramGb}gb`)) score += 25;
    else if (ramGb <= 8  && (haystack.includes('8 gb')  || haystack.includes('8gb')))  score += 15;
    else if (ramGb <= 16 && (haystack.includes('16 gb') || haystack.includes('16gb'))) score += 20;
  }

  const storeGb   = requerimiento.almacenamiento?.capacidad_gb;
  const storeTipo = (requerimiento.almacenamiento?.tipo || '').toLowerCase();
  if (storeGb && (haystack.includes(`${storeGb} gb`) || haystack.includes(`${storeGb}gb`))) score += 15;
  if (storeTipo && haystack.includes(storeTipo.replace(' ', ''))) score += 5;

  const so = (requerimiento.sistema_operativo || '').toLowerCase();
  if (so.includes('windows') && haystack.includes('windows')) score += 10;

  if (haystack.includes('lan: si')) score += 5;
  if ((ficha.estado || '').toLowerCase() === 'ofertada') score += 5;

  return Math.min(score, 100);
};


// ─────────────────────────────────────────────
// CACHÉ EN BASE DE DATOS
// ─────────────────────────────────────────────
const getCachedFichas = async (marca, tipo, limit) => {
  try {
    const result = await pool.query(
      `SELECT * FROM products
       WHERE LOWER(marca) = LOWER($1)
         AND LOWER(categoria) = LOWER($2)
         AND ultima_actualizacion > NOW() - INTERVAL '24 hours'
       ORDER BY ultima_actualizacion DESC
       LIMIT $3`,
      [marca, tipo, limit]
    );
    return result.rows.map(r => ({
      fichaId:     r.ficha_id,
      nombre:      r.nombre,
      numeroParte: r.specs?.numeroParte || '',
      imgUrl:      r.specs?.imgUrl || '',
      pdfUrl:      r.pdf_url || r.specs?.pdfUrl || '',
      specsFp:     r.specs?.specsFp || '',
      specsObj:    r.specs?.specsObj || {},
      specsTexto:  r.specs?.specsTexto || {},
      estado:      r.specs?.estado || '',
      catalogo:    r.specs?.catalogo || '',
      categoria:   r.categoria || tipo,
      urlBuscador: 'https://buscadorcatalogos.perucompras.gob.pe/',
    }));
  } catch (e) {
    console.error('[Scraper] Error leyendo caché:', e.message);
    return [];
  }
};

const saveFichasToCache = async (fichas, marca, tipo) => {
  try {
    for (const f of fichas) {
      await pool.query(
        `INSERT INTO products (ficha_id, marca, nombre, categoria, specs, pdf_url, url_ficha, ultima_actualizacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (ficha_id) DO UPDATE
           SET specs               = $5,
               pdf_url             = $6,
               categoria           = $4,
               ultima_actualizacion = NOW()`,
        [
          f.fichaId, marca, f.nombre, tipo,
          JSON.stringify({
            numeroParte: f.numeroParte,
            imgUrl:      f.imgUrl,
            pdfUrl:      f.pdfUrl,
            specsFp:     f.specsFp,
            specsObj:    f.specsObj,
            specsTexto:  f.specsTexto,
            estado:      f.estado,
            catalogo:    f.catalogo,
          }),
          f.pdfUrl || null,
          f.urlBuscador,
        ]
      );
    }
    console.log(`[Scraper] ${fichas.length} fichas guardadas en caché`);
  } catch (e) {
    console.error('[Scraper] Error guardando caché:', e.message);
  }
};


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = {
  searchCompatibleProducts,
  searchFichasByMarcaYTipo,
};
