// src/services/bulkScraperService.js
'use strict';

const { chromium } = require('playwright');
const { Pool }     = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';
const CATALOGO_ID  = 'EXT-CE-2022-5';

const BUSQUEDAS_BULK = [
  { termino: 'computadora de escritorio', categoria: 'desktop'    },
  { termino: 'computadora portatil',      categoria: 'laptop'     },
  { termino: 'computadora all in one',    categoria: 'all-in-one' },
];

const MARCAS_PERMITIDAS = ['kenya', 'lenovo', 'hp', 'kenya technology', 'hewlett', 'hp inc'];

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL DE SYNC MASIVO
// ─────────────────────────────────────────────────────────────
const syncCatalogoBulk = async (onProgress = null) => {
  const inicio  = Date.now();
  const resumen = { total: 0, nuevas: 0, actualizadas: 0, errores: 0, categorias: {} };

  console.log('[BulkScraper] ════ INICIO DE SINCRONIZACIÓN DEL CATÁLOGO ════');
  console.log('[BulkScraper] Catálogo:', CATALOGO_ID);
  console.log('[BulkScraper] Búsquedas a realizar:', BUSQUEDAS_BULK.length);

  for (let i = 0; i < BUSQUEDAS_BULK.length; i++) {
    const { termino, categoria } = BUSQUEDAS_BULK[i];
    console.log('\n[BulkScraper] ── Categoría:', categoria, '(término: "' + termino + '") ──');

    try {
      const fichas = await scrapearTodasLasFichas(termino, categoria);

      const fichasFiltradas = fichas.filter(f => {
        const texto = (f.nombre + ' ' + f.specsFp).toLowerCase();
        return MARCAS_PERMITIDAS.some(m => texto.includes(m));
      });

      console.log('[BulkScraper]', fichas.length, 'fichas totales →', fichasFiltradas.length, 'de marcas permitidas');

      let nuevas = 0, actualizadas = 0;
      for (const ficha of fichasFiltradas) {
        const res = await upsertFicha(ficha, categoria);
        if (res === 'nueva')       nuevas++;
        else if (res === 'actualizada') actualizadas++;
      }

      resumen.categorias[categoria] = { total: fichasFiltradas.length, nuevas, actualizadas };
      resumen.total        += fichasFiltradas.length;
      resumen.nuevas       += nuevas;
      resumen.actualizadas += actualizadas;

      if (onProgress) onProgress({ categoria, fichas: fichasFiltradas.length, nuevas, actualizadas });

    } catch (err) {
      console.error('[BulkScraper] Error en categoría', categoria + ':', err.message);
      resumen.errores++;
    }

    if (i < BUSQUEDAS_BULK.length - 1) await delay(5000);
  }

  const duracion = Math.round((Date.now() - inicio) / 1000);
  resumen.duracion_segundos = duracion;
  await registrarSync(resumen);

  console.log('\n[BulkScraper] ════ SYNC COMPLETADO en', duracion + 's ════');
  console.log('[BulkScraper] Total:', resumen.total, '| Nuevas:', resumen.nuevas, '| Actualizadas:', resumen.actualizadas);
  return resumen;
};


// ─────────────────────────────────────────────────────────────
// SCRAPEAR TODAS LAS FICHAS DE UNA CATEGORÍA (con paginación)
// ─────────────────────────────────────────────────────────────
const scrapearTodasLasFichas = async (termino, categoria) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport:  { width: 1366, height: 900 },
    locale:    'es-PE',
  });

  const page = await context.newPage();
  const todasLasFichas = [];

  try {
    await page.goto(BUSCADOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    await cerrarModalBloqueante(page);
    await page.waitForTimeout(500);

    const searchInput = await encontrarInput(page);
    if (!searchInput) throw new Error('Input de búsqueda no encontrado');

    await searchInput.click();
    await page.waitForTimeout(200);
    await page.keyboard.type(termino, { delay: 80 });
    await page.waitForTimeout(600);

    await activarBusqueda(page, searchInput);

    console.log('[BulkScraper] Esperando resultados para "' + termino + '"...');
    await esperarResultados(page, 20000);

    let pagina = 1;
    let hayMas = true;

    while (hayMas) {
      const fichasDePagina = await extraerFichasDePagina(page);
      todasLasFichas.push(...fichasDePagina);
      console.log('[BulkScraper] Página', pagina + ': ' + fichasDePagina.length + ' fichas (total: ' + todasLasFichas.length + ')');

      const siguiente = await irSiguientePagina(page);
      if (!siguiente) {
        hayMas = false;
      } else {
        pagina++;
        await page.waitForTimeout(2000);
        await esperarResultados(page, 10000);
      }
      if (pagina > 20) {
        console.log('[BulkScraper] Límite de 20 páginas alcanzado');
        break;
      }
    }

    console.log('[BulkScraper] Total extraído "' + termino + '": ' + todasLasFichas.length + ' fichas');
    return todasLasFichas;
  } finally {
    await browser.close();
  }
};


// ─────────────────────────────────────────────────────────────
// HELPERS DEL SCRAPER
// ─────────────────────────────────────────────────────────────
const cerrarModalBloqueante = async (page) => {
  try {
    const modal = await page.$('#divPopUpComunicadoBloqueado.show');
    if (!modal) return;

    console.log('[BulkScraper] Modal detectado — cerrando...');

    try {
      await page.click(
        '#divPopUpComunicadoBloqueado .close,' +
        '#divPopUpComunicadoBloqueado [data-dismiss="modal"],' +
        '#divPopUpComunicadoBloqueado button',
        { timeout: 3000, force: true }
      );
      await page.waitForTimeout(600);
      if (!(await page.$('#divPopUpComunicadoBloqueado.show'))) {
        console.log('[BulkScraper] Modal cerrado con botón');
        return;
      }
    } catch (_) {}

    await page.evaluate(() => {
      if (typeof $ !== 'undefined') $('#divPopUpComunicadoBloqueado').modal('hide');
      const m = document.getElementById('divPopUpComunicadoBloqueado');
      if (m) { m.classList.remove('show'); m.style.display = 'none'; }
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
    });

    await page.addStyleTag({
      content: '#divPopUpComunicadoBloqueado,.modal-backdrop{display:none!important;pointer-events:none!important}body{overflow:auto!important}',
    });

    await page.waitForTimeout(400);
    console.log('[BulkScraper] Modal cerrado');
  } catch (_) {}
};

const encontrarInput = async (page) => {
  for (const sel of [
    'input[placeholder*="Buscar"]', 'input[placeholder*="buscar"]',
    'input[placeholder*="letras"]', '#txtBuscar', 'input[type="search"]', 'input[type="text"]',
  ]) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) return el;
  }
  return null;
};

const activarBusqueda = async (page, searchInput) => {
  for (const bSel of [
    '.input-group-append button', '.input-group button',
    'button[type="submit"]', '#btnBuscar', '.btn-buscar', 'button.btn-primary',
  ]) {
    const btn = await page.$(bSel);
    if (btn && await btn.isVisible()) {
      await btn.click({ force: true }).catch(() => {});
      return;
    }
  }
  await searchInput.press('Enter');
};

const esperarResultados = async (page, timeout = 15000) => {
  const inicio = Date.now();
  while (Date.now() - inicio < timeout) {
    const count = await page.$$eval('a.enlace-detalles', els => els.length).catch(() => 0);
    if (count > 0) return count;
    await page.waitForTimeout(1500);
  }
  return 0;
};

const extraerFichasDePagina = async (page) => {
  return await page.$$eval('a.enlace-detalles', (elements) => {
    return elements.map(el => {
      const card        = el.closest('.card');
      const fichaId     = el.id || '';
      const nombre      = card?.querySelector('.card-title-custom, h4.card-title')?.innerText?.trim() || '';
      const numeroParte = card?.querySelector('.card-title b, h5 b')?.innerText?.trim()              || '';
      const imgUrl      = el.getAttribute('data-img')              || '';
      const pdfUrl      = el.getAttribute('data-file')             || '';
      const specsFp     = el.getAttribute('data-fp')               || '';
      const specsHtml   = el.getAttribute('data-feature')          || '';
      const estado      = el.getAttribute('data-status')           || '';
      const catalogo    = el.getAttribute('data-catalogue')        || '';
      const categoria   = el.getAttribute('data-category')         || '';
      const fechaPub    = el.getAttribute('data-published-date')   || '';

      const specsObj = {};
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = specsHtml;
        tmp.querySelectorAll('li').forEach(li => {
          const txt = li.innerText?.trim() || '';
          const idx = txt.indexOf(':');
          if (idx > -1) {
            const k = txt.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
            specsObj[k] = txt.slice(idx + 1).trim();
          }
        });
      } catch (_) {}

      const textoLower = (nombre + ' ' + specsFp).toLowerCase();
      let marcaDetectada = 'otra';
      if      (textoLower.includes('kenya'))                            marcaDetectada = 'kenya';
      else if (textoLower.includes('lenovo'))                           marcaDetectada = 'lenovo';
      else if (textoLower.includes('hp') || textoLower.includes('hewlett')) marcaDetectada = 'hp';
      else if (textoLower.includes('dell'))                             marcaDetectada = 'dell';
      else if (textoLower.includes('asus'))                             marcaDetectada = 'asus';
      else if (textoLower.includes('acer'))                             marcaDetectada = 'acer';

      return { fichaId, nombre, numeroParte, imgUrl, pdfUrl, specsFp, specsObj, estado, catalogo, categoria, fechaPub, marcaDetectada };
    });
  });
};

const irSiguientePagina = async (page) => {
  for (const sel of [
    'li.page-item:not(.disabled) a[aria-label="Next"]',
    '.pagination li:not(.disabled) a:last-child',
    '.pagination .next:not(.disabled) a',
    'a[rel="next"]',
    '#btnSiguiente:not([disabled])',
  ]) {
    const btn = await page.$(sel);
    if (btn && await btn.isVisible()) {
      await btn.click();
      return true;
    }
  }
  return false;
};


// ─────────────────────────────────────────────────────────────
// BASE DE DATOS
// ─────────────────────────────────────────────────────────────
const upsertFicha = async (ficha, categoria) => {
  if (!ficha.fichaId) return 'ignorada';
  try {
    const existing = await pool.query('SELECT id FROM products WHERE ficha_id = $1', [ficha.fichaId]);
    await pool.query(
      `INSERT INTO products (ficha_id, marca, nombre, categoria, specs, pdf_url, url_ficha, ultima_actualizacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (ficha_id) DO UPDATE
         SET nombre=$3, marca=$2, categoria=$4, specs=$5, pdf_url=$6, ultima_actualizacion=NOW()`,
      [
        ficha.fichaId, ficha.marcaDetectada, ficha.nombre, categoria,
        JSON.stringify({ numeroParte: ficha.numeroParte, imgUrl: ficha.imgUrl, pdfUrl: ficha.pdfUrl,
                         specsFp: ficha.specsFp, specsObj: ficha.specsObj, estado: ficha.estado,
                         catalogo: ficha.catalogo, fechaPub: ficha.fechaPub }),
        ficha.pdfUrl, 'https://buscadorcatalogos.perucompras.gob.pe/',
      ]
    );
    return existing.rows.length > 0 ? 'actualizada' : 'nueva';
  } catch (e) {
    console.error('[BulkScraper] DB upsert error:', e.message);
    return 'error';
  }
};

const registrarSync = async (resumen) => {
  await pool.query(
    `INSERT INTO catalog_sync_log (sync_date, total_fichas, nuevas, actualizadas, errores, duracion_seg, detalle)
     VALUES (NOW(),$1,$2,$3,$4,$5,$6)`,
    [resumen.total, resumen.nuevas, resumen.actualizadas, resumen.errores, resumen.duracion_segundos, JSON.stringify(resumen.categorias)]
  ).catch(() => {});
};

const delay = ms => new Promise(r => setTimeout(r, ms));

module.exports = { syncCatalogoBulk };
