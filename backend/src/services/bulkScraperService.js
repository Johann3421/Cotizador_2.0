// src/services/bulkScraperService.js  — versión simplificada y robusta
'use strict';

const { chromium } = require('playwright');
const { Pool }     = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';

const BUSQUEDAS = [
  { termino: 'computadora de escritorio', categoria: 'desktop'    },
  { termino: 'computadora portatil',      categoria: 'laptop'     },
  { termino: 'computadora all in one',    categoria: 'all-in-one' },
];

const MARCAS_FILTRO = ['kenya', 'lenovo', 'hp', 'hewlett'];

const syncCatalogoBulk = async (onProgress = null) => {
  const resumen = { total: 0, nuevas: 0, actualizadas: 0, errores: 0, categorias: {}, duracion_segundos: 0 };
  const t0 = Date.now();

  for (const { termino, categoria } of BUSQUEDAS) {
    console.log(`\n[Bulk] ── ${categoria.toUpperCase()} ──`);
    try {
      const fichas = await scrapear(termino);
      const filtradas = fichas.filter(f => {
        const txt = (f.nombre + ' ' + f.specsFp).toLowerCase();
        return MARCAS_FILTRO.some(m => txt.includes(m));
      });
      console.log(`[Bulk] ${fichas.length} fichas totales → ${filtradas.length} de marcas permitidas`);

      let nuevas = 0, actualizadas = 0;
      for (const f of filtradas) {
        const r = await guardar(f, categoria);
        if (r === 'nueva') nuevas++;
        else if (r === 'actualizada') actualizadas++;
      }
      resumen.categorias[categoria] = { total: filtradas.length, nuevas, actualizadas };
      resumen.total        += filtradas.length;
      resumen.nuevas       += nuevas;
      resumen.actualizadas += actualizadas;
      if (onProgress) onProgress({ categoria, fichas: filtradas.length, nuevas, actualizadas });
    } catch (e) {
      console.error(`[Bulk] Error en ${categoria}:`, e.message);
      resumen.errores++;
    }
    await new Promise(r => setTimeout(r, 4000));
  }

  resumen.duracion_segundos = Math.round((Date.now() - t0) / 1000);

  // Registrar en log (no falla si la tabla no existe)
  await pool.query(
    `INSERT INTO catalog_sync_log (sync_date,total_fichas,nuevas,actualizadas,errores,duracion_seg,detalle)
     VALUES (NOW(),$1,$2,$3,$4,$5,$6)`,
    [resumen.total, resumen.nuevas, resumen.actualizadas, resumen.errores,
     resumen.duracion_segundos, JSON.stringify(resumen.categorias)]
  ).catch(() => {});

  console.log(`\n[Bulk] Sync completo en ${resumen.duracion_segundos}s — ${resumen.total} fichas`);
  return resumen;
};


// ── Scraping de una categoría completa (con paginación) ──────────────────────
const scrapear = async (termino) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });

  const todas = [];

  try {
    await page.goto(BUSCADOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    await cerrarModal(page);
    await new Promise(r => setTimeout(r, 500));

    // Encontrar input
    const input = await page.$('input[placeholder*="Buscar"], input[placeholder*="buscar"], input[type="text"]');
    if (!input) throw new Error('Input de búsqueda no encontrado');

    // Forzar foco via JS antes de tipear
    await page.evaluate(() => {
      const el = document.querySelector('input[placeholder*="Buscar"], input[placeholder*="buscar"], input[type="text"]');
      if (el) el.focus();
    });
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.type(termino, { delay: 80 });
    await new Promise(r => setTimeout(r, 600));

    // Intentar botón de búsqueda
    const btn = await page.$('.input-group-append button, button[type="submit"], #btnBuscar, .btn-primary');
    if (btn) await btn.click({ force: true }).catch(() => {});
    else await input.press('Enter');

    // Polling de resultados (máx 30s)
    console.log(`[Bulk] Esperando resultados para "${termino}"...`);
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const n = await page.$$eval('a.enlace-detalles', e => e.length).catch(() => 0);
      if (n > 0) { console.log(`[Bulk] ${n} fichas cargadas (${(i+1)*1.5}s)`); break; }
      if (i === 5) await cerrarModal(page);  // re-cerrar si reaparece
      if (i === 9) {
        // Screenshot diagnóstico
        await page.screenshot({ path: `/tmp/bulk-wait-${termino.split(' ')[1] || 'x'}.png`, fullPage: true }).catch(() => {});
      }
    }

    // Paginación
    let pagina = 1;
    while (true) {
      const fichas = await extraer(page);
      todas.push(...fichas);
      console.log(`[Bulk] Página ${pagina}: ${fichas.length} fichas (total: ${todas.length})`);

      const next = await page.$(
        'li.page-item:not(.disabled) a[aria-label="Next"], ' +
        '.pagination .next:not(.disabled) a, ' +
        'li.next:not(.disabled) a'
      );
      if (!next) break;
      await next.click();
      await new Promise(r => setTimeout(r, 2000));
      pagina++;
      if (pagina > 25) break;
    }
  } finally {
    await browser.close();
  }
  return todas;
};


// ── Cerrar modal #divPopUpComunicadoBloqueado ──────────────────────────────────
const cerrarModal = async (page) => {
  try {
    if (!(await page.$('#divPopUpComunicadoBloqueado.show'))) return;
    console.log('[Bulk] Cerrando modal bloqueante...');

    await page.click(
      '#divPopUpComunicadoBloqueado .close,' +
      '#divPopUpComunicadoBloqueado [data-dismiss="modal"],' +
      '#divPopUpComunicadoBloqueado button',
      { timeout: 3000, force: true }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    if (await page.$('#divPopUpComunicadoBloqueado.show')) {
      await page.evaluate(() => {
        if (typeof $ !== 'undefined') $('#divPopUpComunicadoBloqueado').modal('hide');
        const m = document.getElementById('divPopUpComunicadoBloqueado');
        if (m) { m.classList.remove('show'); m.style.display = 'none'; }
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      });
    }

    await page.addStyleTag({
      content: '#divPopUpComunicadoBloqueado,.modal-backdrop{display:none!important;pointer-events:none!important}body{overflow:auto!important}',
    });
    await new Promise(r => setTimeout(r, 300));
    console.log('[Bulk] Modal cerrado');
  } catch (_) {}
};


// ── Extraer fichas del DOM de la página actual ─────────────────────────────────
const extraer = (page) => page.$$eval('a.enlace-detalles', els => els.map(el => {
  const card        = el.closest('.card');
  const fichaId     = el.id                                                        || '';
  const nombre      = card?.querySelector('.card-title-custom,h4.card-title')?.innerText?.trim() || '';
  const numeroParte = card?.querySelector('.card-title b,h5 b')?.innerText?.trim() || '';
  const imgUrl      = el.getAttribute('data-img')             || '';
  const pdfUrl      = el.getAttribute('data-file')            || '';
  const specsFp     = el.getAttribute('data-fp')              || '';
  const specsHtml   = el.getAttribute('data-feature')         || '';
  const estado      = el.getAttribute('data-status')          || '';
  const catalogo    = el.getAttribute('data-catalogue')       || '';
  const fechaPub    = el.getAttribute('data-published-date')  || '';

  const specsObj = {};
  try {
    const d = document.createElement('div');
    d.innerHTML = specsHtml;
    d.querySelectorAll('li').forEach(li => {
      const t = li.innerText?.trim() || '';
      const i = t.indexOf(':');
      if (i > -1) specsObj[t.slice(0,i).trim().toLowerCase().replace(/\s+/g,'_')] = t.slice(i+1).trim();
    });
  } catch(_) {}

  const n = (nombre + ' ' + specsFp).toLowerCase();
  let marcaDetectada = 'otra';
  if      (n.includes('kenya'))                            marcaDetectada = 'kenya';
  else if (n.includes('lenovo'))                           marcaDetectada = 'lenovo';
  else if (n.includes('hp') || n.includes('hewlett'))     marcaDetectada = 'hp';
  else if (n.includes('dell'))                             marcaDetectada = 'dell';
  else if (n.includes('asus'))                             marcaDetectada = 'asus';
  else if (n.includes('acer'))                             marcaDetectada = 'acer';

  return { fichaId, nombre, numeroParte, imgUrl, pdfUrl, specsFp, specsObj, estado, catalogo, fechaPub, marcaDetectada };
}));


// ── Guardar ficha en PostgreSQL (upsert) ───────────────────────────────────────
const guardar = async (f, categoria) => {
  if (!f.fichaId) return 'ignorada';
  try {
    const ex = await pool.query('SELECT id FROM products WHERE ficha_id=$1', [f.fichaId]);
    await pool.query(
      `INSERT INTO products (ficha_id,marca,nombre,categoria,specs,pdf_url,url_ficha,ultima_actualizacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (ficha_id) DO UPDATE
         SET nombre=$3,marca=$2,categoria=$4,specs=$5,pdf_url=$6,ultima_actualizacion=NOW()`,
      [
        f.fichaId, f.marcaDetectada, f.nombre, categoria,
        JSON.stringify({ numeroParte:f.numeroParte, imgUrl:f.imgUrl, pdfUrl:f.pdfUrl,
                         specsFp:f.specsFp, specsObj:f.specsObj, estado:f.estado,
                         catalogo:f.catalogo, fechaPub:f.fechaPub }),
        f.pdfUrl,
        'https://buscadorcatalogos.perucompras.gob.pe/',
      ]
    );
    return ex.rows.length > 0 ? 'actualizada' : 'nueva';
  } catch (e) {
    console.error('[Bulk] DB error:', e.message);
    return 'error';
  }
};

module.exports = { syncCatalogoBulk };
