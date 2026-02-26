// src/services/scraperService.js
'use strict';

const { chromium } = require('playwright');
const { Pool }     = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';

const WAIT_TYPING_MS  = parseInt(process.env.SCRAPER_WAIT_TYPING  || '600');
const WAIT_RESULTS_MS = parseInt(process.env.SCRAPER_WAIT_RESULTS || '8000');
const WAIT_BRANDS_MS  = parseInt(process.env.SCRAPER_WAIT_BRANDS  || '3000');

const TERMINOS = {
  desktop:      { kenya: 'computadora de escritorio kenya', lenovo: 'computadora de escritorio lenovo', hp: 'computadora de escritorio hp' },
  laptop:       { kenya: 'computadora portatil kenya',      lenovo: 'computadora portatil lenovo',      hp: 'computadora portatil hp'      },
  'all-in-one': { kenya: 'computadora all in one kenya',    lenovo: 'computadora all in one lenovo',    hp: 'computadora all in one hp'    },
};

// ─────────────────────────────────────────────────────────────────────────────
// ★ CERRAR MODAL BLOQUEANTE
// El portal muestra un modal #divPopUpComunicadoBloqueado con
// data-backdrop="static" data-keyboard="false" que intercepta TODOS los
// pointer-events. Debe cerrarse ANTES de cualquier interacción.
// ─────────────────────────────────────────────────────────────────────────────
const cerrarModalBloqueante = async (page) => {
  try {
    const modalVisible = await page.$('#divPopUpComunicadoBloqueado.show');
    if (!modalVisible) {
      console.log('[Scraper] No hay modal bloqueante');
      return;
    }

    console.log('[Scraper] ⚠️  Modal bloqueante detectado — cerrando...');

    // Método 1: botón de cierre del modal
    try {
      await page.click(
        '#divPopUpComunicadoBloqueado .close, ' +
        '#divPopUpComunicadoBloqueado [data-dismiss="modal"], ' +
        '#divPopUpComunicadoBloqueado .btn-cerrar, ' +
        '#divPopUpComunicadoBloqueado .btn-secondary, ' +
        '#divPopUpComunicadoBloqueado button:last-of-type',
        { timeout: 3000, force: true }
      );
      await page.waitForTimeout(800);
      const aun = await page.$('#divPopUpComunicadoBloqueado.show');
      if (!aun) { console.log('[Scraper] ✅ Modal cerrado con botón'); return; }
    } catch (_) {}

    // Método 2: jQuery / manipulación directa del DOM
    await page.evaluate(() => {
      if (typeof $ !== 'undefined') $('#divPopUpComunicadoBloqueado').modal('hide');
      const modal = document.getElementById('divPopUpComunicadoBloqueado');
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');
      }
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    });
    await page.waitForTimeout(500);
    console.log('[Scraper] ✅ Modal cerrado con JavaScript');
  } catch (_) {
    // Método 3 (último recurso): CSS override
    console.log('[Scraper] Forzando modal oculto via CSS...');
    await page.addStyleTag({
      content: `
        #divPopUpComunicadoBloqueado, .modal-backdrop {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        body { overflow: auto !important; padding-right: 0 !important; }
      `,
    });
    await page.waitForTimeout(300);
    console.log('[Scraper] ✅ Modal ocultado via CSS');
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE BÚSQUEDA
// ─────────────────────────────────────────────────────────────────────────────
const searchFichasByMarcaYTipo = async (marca, tipo = 'desktop', limit = 10) => {
  const cached = await getCachedFichas(marca, tipo, limit);
  if (cached.length > 0) {
    console.log(`[Scraper] Cache hit: ${cached.length} fichas de ${marca}/${tipo}`);
    return cached;
  }

  const termino = TERMINOS[tipo]?.[marca] || TERMINOS.desktop[marca];
  if (!termino) return [];

  console.log(`[Scraper] Buscando: "${termino}"`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', '--disable-gpu',
      '--window-size=1366,768',
    ],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport:  { width: 1366, height: 768 },
    locale:    'es-PE',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const page = await context.newPage();

  try {
    // ── PASO 1: Cargar página ─────────────────────────────────────────────
    await page.goto(BUSCADOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500); // jQuery + Bootstrap init

    // ── PASO 2: ★ CERRAR MODAL BLOQUEANTE (ANTES de cualquier click) ──────
    await cerrarModalBloqueante(page);
    await page.waitForTimeout(500);

    // ── PASO 3: Encontrar input de búsqueda ───────────────────────────────
    const INPUT_SELECTORS = [
      'input[placeholder*="Buscar"]',
      'input[placeholder*="buscar"]',
      'input[placeholder*="letras"]',
      '#txtBuscar', '#buscar', 'input[type="search"]', 'input[type="text"]',
    ];

    let searchInput = null;
    for (const sel of INPUT_SELECTORS) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        searchInput = el;
        console.log(`[Scraper] Input: "${sel}"`);
        break;
      }
    }

    if (!searchInput) {
      await page.screenshot({ path: `/tmp/scraper-no-input-${marca}.png`, fullPage: true });
      console.error('[Scraper] ❌ Input no encontrado');
      return [];
    }

    // ── PASO 4: Focus via JS (esquiva cualquier overlay residual) ─────────
    await page.evaluate((sel) => {
      const inp = document.querySelector(sel);
      if (inp) inp.focus();
    }, 'input[placeholder*="Buscar"], input[type="text"]');
    await page.waitForTimeout(300);

    // ── PASO 5: Limpiar y tipear con pressSequentially ───────────────────
    // pressSequentially dispara keydown+keypress+keyup → activa jQuery debounce
    // fill() NO dispara keyup → buscador AJAX nunca reacciona
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    console.log(`[Scraper] Tipeando: "${termino}"`);
    await searchInput.pressSequentially(termino, { delay: 80 });
    await page.waitForTimeout(WAIT_TYPING_MS);

    // ── PASO 6: Activar búsqueda ──────────────────────────────────────────
    const BTN_SELS = [
      '.input-group-append button', '.input-group button',
      'button[type="submit"]', '#btnBuscar', '.btn-buscar',
      'button:has(.fa-search)', 'button.btn-primary',
    ];
    let botonClickeado = false;
    for (const bSel of BTN_SELS) {
      const btn = await page.$(bSel);
      if (btn && await btn.isVisible()) {
        await btn.click({ force: true }).catch(() => {});
        botonClickeado = true;
        console.log(`[Scraper] Botón: "${bSel}"`);
        break;
      }
    }
    if (!botonClickeado) await searchInput.press('Enter');

    // ── PASO 7: Polling resultados (máx 22.5s) ────────────────────────────
    console.log('[Scraper] Esperando resultados...');
    let count = 0;

    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1500);
      count = await page.$$eval('a.enlace-detalles', els => els.length).catch(() => 0);
      if (count > 0) {
        console.log(`[Scraper] ✅ ${count} fichas cargadas (${((i + 1) * 1.5).toFixed(1)}s)`);
        break;
      }
      // Intento 4 (~6s): re-cerrar modal y reintentar Enter
      if (i === 3) {
        await cerrarModalBloqueante(page);
        await searchInput.press('Enter').catch(() => {});
      }
      // Intento 7 (~10.5s): screenshot diagnóstico
      if (i === 6) {
        await page.screenshot({ path: `/tmp/scraper-wait-${marca}.png`, fullPage: true });
        const texto = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (texto.includes('sin resultados') || texto.includes('No se encontr')) {
          console.log('[Scraper] ℹ️ Página reporta sin resultados');
          return [];
        }
      }
    }

    if (count === 0) {
      console.log(`[Scraper] ⚠️  0 resultados para "${termino}"`);
      return [];
    }

    // ── PASO 8: Extraer datos de los cards ────────────────────────────────
    const fichas = await page.$$eval('a.enlace-detalles', (elements, limit) => {
      return elements.slice(0, limit).map(el => {
        const card = el.closest('.card');

        const fichaId     = el.id || '';
        const nombre      = card?.querySelector('.card-title-custom, h4.card-title')?.innerText?.trim() || '';
        const numeroParte = card?.querySelector('.card-title b, h5 b')?.innerText?.trim() || '';
        const imgUrl      = el.getAttribute('data-img')           || '';
        const pdfUrl      = el.getAttribute('data-file')          || '';
        const specsFp     = el.getAttribute('data-fp')            || '';
        const specsHtml   = el.getAttribute('data-feature')       || '';
        const estado      = el.getAttribute('data-status')        || '';
        const catalogo    = el.getAttribute('data-catalogue')     || '';
        const categoria   = el.getAttribute('data-category')      || '';
        const fechaPub    = el.getAttribute('data-published-date')|| '';

        const specsObj = {};
        try {
          const tmp = document.createElement('div');
          tmp.innerHTML = specsHtml;
          tmp.querySelectorAll('li').forEach(li => {
            const txt = li.innerText?.trim() || '';
            const idx = txt.indexOf(':');
            if (idx > -1) {
              const k = txt.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
              const v = txt.slice(idx + 1).trim();
              specsObj[k] = v;
            }
          });
        } catch (_) {}

        return { fichaId, nombre, numeroParte, imgUrl, pdfUrl, specsFp, specsObj, estado, catalogo, categoria, fechaPub };
      });
    }, limit);

    console.log(`[Scraper] ✅ Extraídas ${fichas.length} fichas de ${marca}/${tipo}`);
    if (fichas.length > 0) await saveFichasToCache(fichas, marca, tipo);
    return fichas;

  } catch (err) {
    console.error(`[Scraper] Error fatal ${marca}/${tipo}:`, err.message);
    await page.screenshot({ path: `/tmp/scraper-error-${marca}.png` }).catch(() => {});
    return [];
  } finally {
    await browser.close();
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// BÚSQUEDA PARA LAS 3 MARCAS
// ─────────────────────────────────────────────────────────────────────────────
const searchCompatibleProducts = async (specs) => {
  const tipo   = (specs.tipo_equipo || 'desktop').toLowerCase();
  const MARCAS = ['kenya', 'lenovo', 'hp'];
  const result = {};

  for (const marca of MARCAS) {
    const fichas = await searchFichasByMarcaYTipo(marca, tipo, 10);
    result[marca] = fichas
      .map(f => ({ ...f, score: calcularScore(f, specs) }))
      .sort((a, b) => b.score - a.score);
    await delay(WAIT_BRANDS_MS);
  }

  return result;
};


// ─────────────────────────────────────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD — acepta "O SUPERIOR"
// ─────────────────────────────────────────────────────────────────────────────
const calcularScore = (ficha, req) => {
  let score = 0;
  const hay  = ((ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})).toLowerCase();
  const spOb = ficha.specsObj || {};

  // Procesador (30 pts)
  const modelosReq = (req.procesador?.modelo || '')
    .split(/[;\/]|\bO\b/i)
    .map(m => m?.trim().toLowerCase())
    .filter(Boolean);

  let procScore = 0;
  for (const mod of modelosReq) {
    if (hay.includes(mod)) { procScore = 30; break; }
    const familia = mod.match(/(ultra \d+|i[357]-?\d{4,5}[a-z]*|core \w+ \d+)/)?.[0];
    if (familia && hay.includes(familia)) { procScore = Math.max(procScore, 25); }
    else if (mod.includes('i7') && hay.includes('i7')) { procScore = Math.max(procScore, 20); }
    else if (mod.includes('i5') && hay.includes('i5')) { procScore = Math.max(procScore, 10); }
    else if (mod.includes('ultra') && hay.includes('ultra')) { procScore = Math.max(procScore, 20); }
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
    const stFicha = extraerGb(spOb.almacenamiento || hay.match(/(\d+)\s*(gb|tb)\s*ssd/i)?.[0] || '');
    const stGb = (hay.includes('1 tb') || hay.includes('1tb')) ? 1000 : stFicha;
    if (stGb >= stReq) score += 20;
    else if (stGb > 0) score += Math.round((stGb / stReq) * 12);
  }

  // SO (10 pts)
  const soReq = (req.sistema_operativo || '').toLowerCase();
  if (soReq.includes('windows') && hay.includes('windows')) score += 7;
  if (soReq.includes('11') && hay.includes('11')) score += 3;

  // Conectividad (10 pts)
  if (hay.includes('lan: si'))  score += 4;
  if (hay.includes('hdmi: si')) score += 3;
  if (hay.includes('usb: si'))  score += 3;

  // Estado OFERTADA (5 pts)
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


// ─────────────────────────────────────────────────────────────────────────────
// CACHÉ POSTGRESQL
// ─────────────────────────────────────────────────────────────────────────────
const getCachedFichas = async (marca, tipo, limit) => {
  try {
    const r = await pool.query(
      `SELECT * FROM products
       WHERE LOWER(marca) = LOWER($1) AND LOWER(categoria) = LOWER($2)
         AND ultima_actualizacion > NOW() - INTERVAL '24 hours'
       ORDER BY ultima_actualizacion DESC LIMIT $3`,
      [marca, tipo, limit]
    );
    return r.rows.map(row => ({
      fichaId:    row.ficha_id,
      nombre:     row.nombre,
      numeroParte:row.specs?.numeroParte || '',
      imgUrl:     row.specs?.imgUrl      || '',
      pdfUrl:     row.pdf_url || row.specs?.pdfUrl || '',
      specsFp:    row.specs?.specsFp     || '',
      specsObj:   row.specs?.specsObj    || {},
      estado:     row.specs?.estado      || '',
      catalogo:   row.specs?.catalogo    || '',
      categoria:  row.specs?.categoria   || tipo,
    }));
  } catch (e) {
    console.error('[Scraper] Cache GET error:', e.message);
    return [];
  }
};

const saveFichasToCache = async (fichas, marca, tipo) => {
  for (const f of fichas) {
    await pool.query(
      `INSERT INTO products (ficha_id, marca, nombre, categoria, specs, pdf_url, url_ficha, ultima_actualizacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (ficha_id) DO UPDATE
         SET specs=$5, pdf_url=$6, ultima_actualizacion=NOW()`,
      [
        f.fichaId, marca, f.nombre, tipo,
        JSON.stringify({ numeroParte: f.numeroParte, imgUrl: f.imgUrl, pdfUrl: f.pdfUrl,
                         specsFp: f.specsFp, specsObj: f.specsObj, estado: f.estado, catalogo: f.catalogo }),
        f.pdfUrl || null,
        'https://buscadorcatalogos.perucompras.gob.pe/',
      ]
    ).catch(e => console.error('[Scraper] Cache SAVE error:', e.message));
  }
};

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = { searchCompatibleProducts, searchFichasByMarcaYTipo };
