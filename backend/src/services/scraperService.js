// src/services/scraperService.js
'use strict';

const { chromium } = require('playwright');
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';

// Esperas configurables vía .env (en ms)
const WAIT_AFTER_TYPING_MS   = parseInt(process.env.SCRAPER_WAIT_TYPING  || '500');
const WAIT_FOR_RESULTS_MS    = parseInt(process.env.SCRAPER_WAIT_RESULTS || '8000');
const WAIT_BETWEEN_BRANDS_MS = parseInt(process.env.SCRAPER_WAIT_BRANDS  || '3000');

// Términos de búsqueda exactos — tal como los escribe un usuario humano
const TERMINOS = {
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

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE BÚSQUEDA
// ─────────────────────────────────────────────────────────────
const searchFichasByMarcaYTipo = async (marca, tipo = 'desktop', limit = 10) => {
  // 1. Verificar caché
  const cached = await getCachedFichas(marca, tipo, limit);
  if (cached.length > 0) {
    console.log(`[Scraper] Cache hit: ${cached.length} fichas de ${marca}/${tipo}`);
    return cached;
  }

  const termino = TERMINOS[tipo]?.[marca] || TERMINOS.desktop[marca];
  if (!termino) return [];

  console.log(`[Scraper] Iniciando búsqueda: "${termino}"`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--window-size=1366,768',
    ],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'es-PE',
    extraHTTPHeaders: {
      'Accept-Language': 'es-PE,es;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  const page = await context.newPage();

  try {
    // ── PASO 1: Cargar la página ──────────────────────────────
    await page.goto(BUSCADOR_URL, {
      waitUntil: 'domcontentloaded', // NO networkidle — puede bloquearse
      timeout: 30000,
    });

    // Esperar que jQuery y los scripts iniciales terminen
    await page.waitForTimeout(2000);

    // ── PASO 2: Encontrar el input de búsqueda ─────────────────
    const INPUT_SELECTORS = [
      'input[placeholder*="Buscar"]',
      'input[placeholder*="buscar"]',
      'input[placeholder*="letras"]',
      '#txtBuscar',
      '#buscar',
      'input[type="search"]',
      'input[type="text"]',
    ];

    let searchInput = null;
    for (const sel of INPUT_SELECTORS) {
      const el = await page.$(sel);
      if (el && await el.isVisible()) {
        searchInput = el;
        console.log(`[Scraper] Input encontrado: "${sel}"`);
        break;
      }
    }

    if (!searchInput) {
      await page.screenshot({ path: '/tmp/scraper-no-input.png', fullPage: true });
      const html = await page.content();
      fs.writeFileSync('/tmp/scraper-no-input.html', html);
      console.error('[Scraper] ❌ Input no encontrado. Ver /tmp/scraper-no-input.png y .html');
      return [];
    }

    // ── PASO 3: CLAVE — Tipear con pressSequentially ───────────
    // pressSequentially dispara keydown + keypress + keyup por cada letra.
    // Esto activa el listener jQuery de búsqueda. fill() NO lo hace.

    await searchInput.click();
    await page.waitForTimeout(300);

    // Limpiar contenido previo
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    console.log(`[Scraper] Tipeando: "${termino}"`);

    // delay:80ms simula velocidad humana y activa el debounce de jQuery
    await searchInput.pressSequentially(termino, { delay: 80 });

    await page.waitForTimeout(WAIT_AFTER_TYPING_MS);

    // ── PASO 4: Activar búsqueda — todas las estrategias ──────
    let resultadosYaCargados = false;

    // Estrategia A: botón de búsqueda
    const BUTTON_SELECTORS = [
      'button[type="submit"]',
      '#btnBuscar',
      '#btn-buscar',
      '.btn-buscar',
      '.input-group-append button',
      '.input-group button',
      'button.btn-primary',
      'button:has(i.fa-search)',
      'button:has(i.fas.fa-search)',
    ];

    for (const bSel of BUTTON_SELECTORS) {
      try {
        const btn = await page.$(bSel);
        if (btn && await btn.isVisible()) {
          console.log(`[Scraper] Clickeando botón: "${bSel}"`);
          await btn.click();
          await page.waitForTimeout(2000);
          const count = await page.$$eval('a.enlace-detalles', els => els.length).catch(() => 0);
          if (count > 0) {
            resultadosYaCargados = true;
            console.log(`[Scraper] Resultados tras botón: ${count}`);
            break;
          }
        }
      } catch (_) {}
    }

    // Estrategia B: Enter
    if (!resultadosYaCargados) {
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
    }

    // ── PASO 5: Polling hasta que aparezcan los resultados ────
    console.log('[Scraper] Esperando resultados...');

    const MAX_INTENTOS = 12; // 12 × 1.5s = 18s máximo
    let fichasEncontradas = 0;

    for (let i = 0; i < MAX_INTENTOS; i++) {
      await page.waitForTimeout(1500);

      fichasEncontradas = await page.$$eval(
        'a.enlace-detalles, .enlace-detalles',
        els => els.length
      ).catch(() => 0);

      if (fichasEncontradas > 0) {
        console.log(`[Scraper] ✅ ${fichasEncontradas} fichas (intento ${i + 1})`);
        break;
      }

      // Intento 4 (~6s): reintentar Enter
      if (i === 3) {
        console.log(`[Scraper] Reintentando Enter (intento ${i + 1})...`);
        await searchInput.press('Enter');
      }

      // Intento 6 (~9s): screenshot diagnóstico
      if (i === 5) {
        await page.screenshot({ path: `/tmp/scraper-waiting-${marca}.png`, fullPage: true });
        console.log(`[Scraper] Screenshot: /tmp/scraper-waiting-${marca}.png`);
        const textoHTML = await page.evaluate(() => document.body.innerText).catch(() => '');
        if (textoHTML.includes('sin resultados') || textoHTML.includes('No se encontr')) {
          console.log('[Scraper] ℹ️ Página indica que no hay resultados');
          return [];
        }
      }
    }

    if (fichasEncontradas === 0) {
      console.log(`[Scraper] ⚠️ 0 resultados para "${termino}"`);

      // Último recurso: término más corto
      const terminoCorto = tipo === 'laptop' ? 'computadora portatil' : 'computadora escritorio';
      const terminoFallback = `${terminoCorto} ${marca}`;
      console.log(`[Scraper] Fallback: "${terminoFallback}"`);

      await searchInput.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await searchInput.pressSequentially(terminoFallback, { delay: 80 });
      await page.waitForTimeout(WAIT_FOR_RESULTS_MS);

      fichasEncontradas = await page.$$eval('a.enlace-detalles', els => els.length).catch(() => 0);
      console.log(`[Scraper] Fallback resultado: ${fichasEncontradas} fichas`);
    }

    // ── PASO 6: Extraer datos de los cards ────────────────────
    const fichas = await page.$$eval(
      'a.enlace-detalles',
      (elements, limit) => elements.slice(0, limit).map(el => {
        const card = el.closest('.card') || el.closest('[class*="card"]');

        const nombre = card?.querySelector(
          '.card-title-custom, h4.card-title, [class*="title"]'
        )?.innerText?.trim() || el.getAttribute('data-fp')?.split(':')[0]?.trim() || '';

        const numeroParte = card?.querySelector(
          '.card-title b, h5 b, [class*="codigo"]'
        )?.innerText?.trim() || '';

        const fichaId   = el.id || el.getAttribute('data-id') || '';
        const imgUrl    = el.getAttribute('data-img')      || '';
        const pdfUrl    = el.getAttribute('data-file')     || '';
        const specsFp   = el.getAttribute('data-fp')       || '';
        const specsHtml = el.getAttribute('data-feature')  || '';
        const estado    = el.getAttribute('data-status')   || '';
        const catalogo  = el.getAttribute('data-catalogue')|| '';
        const categoria = el.getAttribute('data-category') || '';
        const acuerdo   = el.getAttribute('data-agreement')|| '';
        const fechaPub  = el.getAttribute('data-published-date') || '';

        // Parsear lista de <li>Clave: Valor</li>
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

        return {
          fichaId, nombre, numeroParte,
          imgUrl,  pdfUrl,
          specsFp, specsObj,
          estado, catalogo, categoria, acuerdo,
          fechaPublicacion: fechaPub,
        };
      }),
      limit
    );

    console.log(`[Scraper] ✅ Extraídas ${fichas.length} fichas de ${marca}/${tipo}`);

    if (fichas.length > 0) {
      await saveFichasToCache(fichas, marca, tipo);
    }

    return fichas;

  } catch (err) {
    console.error(`[Scraper] Error fatal en ${marca}/${tipo}:`, err.message);
    try { await page.screenshot({ path: `/tmp/scraper-error-${marca}.png` }); } catch (_) {}
    return [];
  } finally {
    await browser.close();
  }
};


// ─────────────────────────────────────────────────────────────
// BÚSQUEDA PARA LAS 3 MARCAS
// ─────────────────────────────────────────────────────────────
const searchCompatibleProducts = async (specs) => {
  const tipo   = (specs.tipo_equipo || 'desktop').toLowerCase();
  const MARCAS = ['kenya', 'lenovo', 'hp'];
  const resultados = {};

  for (const marca of MARCAS) {
    const fichas = await searchFichasByMarcaYTipo(marca, tipo, 10);
    resultados[marca] = fichas
      .map(f => ({ ...f, score: calcularScore(f, specs) }))
      .sort((a, b) => b.score - a.score);
    await delay(WAIT_BETWEEN_BRANDS_MS);
  }

  return resultados;
};


// ─────────────────────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD
// ─────────────────────────────────────────────────────────────
const calcularScore = (ficha, req) => {
  let score = 0;
  const hay  = ((ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})).toLowerCase();
  const spOb = ficha.specsObj || {};

  // Procesador (30 pts)
  const procReq = (req.procesador?.modelo || '').toLowerCase();
  if (procReq) {
    const modelosAceptados = procReq.split(';').map(m => m.trim()).filter(Boolean);
    for (const modelo of modelosAceptados) {
      const modeloNorm = modelo.replace(/\s+/g, ' ').toLowerCase();
      if (hay.includes(modeloNorm)) { score += 30; break; }
      const familia = modeloNorm.match(/(core (ultra )?\w+\d*|i\d[-\s]?\d+|ryzen \d)/)?.[0];
      if (familia && hay.includes(familia)) { score += 20; break; }
    }
  }

  // RAM (25 pts)
  const ramReq = req.memoria_ram?.capacidad_gb || 0;
  if (ramReq) {
    const ramFicha = parseInt(spOb.ram || hay.match(/(\d+)\s*gb\s*(ddr|ram)/i)?.[1] || '0');
    if (ramFicha >= ramReq) score += 25;
    else if (ramFicha >= ramReq / 2) score += 10;
  }

  // Almacenamiento (20 pts)
  const stReq = req.almacenamiento?.capacidad_gb || 0;
  if (stReq) {
    const stFicha = parseInt(spOb.almacenamiento || hay.match(/(\d+)\s*gb\s*ssd/i)?.[1] || '0');
    if (stFicha >= stReq) score += 20;
    else if (stFicha >= stReq / 2) score += 8;
  }

  // SO (10 pts)
  const soReq = (req.sistema_operativo || '').toLowerCase();
  if (soReq.includes('windows') && hay.includes('windows')) score += 10;

  // Conectividad (10 pts)
  if (hay.includes('lan: si')) score += 5;
  if (hay.includes('hdmi: si')) score += 3;
  if (hay.includes('usb: si')) score += 2;

  // Estado OFERTADA (5 pts)
  if ((ficha.estado || '').toLowerCase() === 'ofertada') score += 5;

  return Math.min(score, 100);
};


// ─────────────────────────────────────────────────────────────
// CACHÉ EN POSTGRESQL
// ─────────────────────────────────────────────────────────────
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
      imgUrl:      r.specs?.imgUrl      || '',
      pdfUrl:      r.pdf_url || r.specs?.pdfUrl || '',
      specsFp:     r.specs?.specsFp     || '',
      specsObj:    r.specs?.specsObj    || {},
      estado:      r.specs?.estado      || '',
      catalogo:    r.specs?.catalogo    || '',
      categoria:   r.specs?.categoria   || tipo,
    }));
  } catch (e) {
    console.error('[Scraper] Error caché GET:', e.message);
    return [];
  }
};

const saveFichasToCache = async (fichas, marca, tipo) => {
  try {
    for (const f of fichas) {
      await pool.query(
        `INSERT INTO products
           (ficha_id, marca, nombre, categoria, specs, pdf_url, url_ficha, ultima_actualizacion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (ficha_id) DO UPDATE
           SET specs                = $5,
               pdf_url              = $6,
               ultima_actualizacion = NOW()`,
        [
          f.fichaId,
          marca,
          f.nombre,
          tipo,
          JSON.stringify({
            numeroParte: f.numeroParte,
            imgUrl:      f.imgUrl,
            pdfUrl:      f.pdfUrl,
            specsFp:     f.specsFp,
            specsObj:    f.specsObj,
            estado:      f.estado,
            catalogo:    f.catalogo,
          }),
          f.pdfUrl || null,
          'https://buscadorcatalogos.perucompras.gob.pe/',
        ]
      );
    }
    console.log(`[Scraper] ${fichas.length} fichas guardadas en caché`);
  } catch (e) {
    console.error('[Scraper] Error caché SAVE:', e.message);
  }
};

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = { searchCompatibleProducts, searchFichasByMarcaYTipo };
