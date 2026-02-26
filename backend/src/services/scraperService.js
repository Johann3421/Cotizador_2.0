"use strict";

const { chromium }         = require('playwright');
const { Pool }             = require('pg');
const { extraerSpecsDePdf } = require('./pdfSpecsService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BUSCADOR_URL = 'https://buscadorcatalogos.perucompras.gob.pe/';

const TERMINOS = {
  desktop:      { kenya: 'computadora de escritorio kenya',  lenovo: 'computadora de escritorio lenovo',  hp: 'computadora de escritorio hp'  },
  laptop:       { kenya: 'computadora portatil kenya',       lenovo: 'computadora portatil lenovo',       hp: 'computadora portatil hp'       },
  'all-in-one': { kenya: 'computadora all in one kenya',     lenovo: 'computadora all in one lenovo',     hp: 'computadora all in one hp'     },
};

// ─────────────────────────────────────────────────────────────
// CARGA DE SPECS DE PDFs EN LOTES (3 a la vez)
// ─────────────────────────────────────────────────────────────
const cargarPdfSpecs = async (fichas) => {
  const BATCH = 3;
  for (let i = 0; i < fichas.length; i += BATCH) {
    const batch = fichas.slice(i, i + BATCH);
    await Promise.all(batch.map(async (f) => {
      if (f.pdfUrl && !f.pdfSpecs) {
        f.pdfSpecs = await extraerSpecsDePdf(f.pdfUrl);
      }
    }));
    await new Promise(r => setTimeout(r, 500));
  }
  return fichas;
};

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL — Busca en DB, si no hay datos hace scraping
// ─────────────────────────────────────────────────────────────
const searchCompatibleProducts = async (specs) => {
  const tipo   = (specs.tipo_equipo || 'desktop').toLowerCase();
  const MARCAS = ['kenya', 'lenovo', 'hp'];
  const result = {};

  for (const marca of MARCAS) {
    // 1. Intentar desde DB (traer 15 para filtrar después)
    let fichas = await buscarEnDB(marca, tipo, 15);

    // 2. Si no hay en DB → scrapear ahora mismo
    if (fichas.length === 0) {
      console.log(`[Scraper] DB vacía para ${marca}/${tipo} → scraping directo...`);
      fichas = await scrapearMarca(marca, tipo);
      if (fichas.length > 0) {
        await guardarEnDB(fichas, marca, tipo);
        console.log(`[Scraper] ${fichas.length} fichas guardadas para ${marca}/${tipo}`);
      }
    }

    // 3. Cargar specs del PDF para comparación precisa
    fichas = await cargarPdfSpecs(fichas);

    // 4. Calcular scores y filtrar solo iguales o superiores (score >= 60)
    const conScore = fichas
      .map(f => ({ ...f, score: calcularScore(f, specs) }))
      .filter(f => f.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    result[marca] = conScore;
    console.log(`[Scraper] ${marca}: ${conScore.length} fichas compatibles (de ${fichas.length} totales, top score: ${conScore[0]?.score ?? 0})`);
  }

  return result;
};

// ─────────────────────────────────────────────────────────────
// SCRAPING DE UNA MARCA
// ─────────────────────────────────────────────────────────────
const scrapearMarca = async (marca, tipo) => {
  const termino = TERMINOS[tipo]?.[marca];
  if (!termino) return [];

  console.log(`[Scraper] Scraping: "${termino}"`);

    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept-Language': 'es-PE,es;q=0.9',
  });

  try {
    // Cargar página
    await page.goto(BUSCADOR_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Cerrar modal bloqueante ANTES de cualquier interacción
    await cerrarModal(page);
    await page.waitForTimeout(600);

    // Encontrar input
    const INPUT_SELS = [
      'input[placeholder*="Buscar"]',
      'input[placeholder*="buscar"]',
      'input[placeholder*="letras"]',
      '#txtBuscar', '#buscar',
      'input[type="search"]',
      'input[type="text"]',
    ];
    let input = null;
    for (const s of INPUT_SELS) {
      const el = await page.$(s);
      if (el && await el.isVisible()) { input = el; console.log(`[Scraper] Input: ${s}`); break; }
    }
    if (!input) {
      await page.screenshot({ path: `/tmp/no-input-${marca}.png`, fullPage: true });
      console.error(`[Scraper] Input no encontrado. Ver /tmp/no-input-${marca}.png`);
      return [];
    }

    // Focus y tipear — keyboard.type dispara keyup (compatible todas las versiones)
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) { el.focus(); el.value = ''; }
    }, INPUT_SELS.find(s => s.includes('Buscar')) || 'input[type="text"]');

    await page.waitForTimeout(300);
    await page.keyboard.type(termino, { delay: 80 });
    await page.waitForTimeout(600);

    // Activar búsqueda
    const BTN_SELS = [
      '.input-group-append button',
      '.input-group button',
      'button[type="submit"]',
      '#btnBuscar',
      '.btn-buscar',
      'button.btn-primary',
    ];
    let botonUsado = false;
    for (const bs of BTN_SELS) {
      const btn = await page.$(bs);
      if (btn && await btn.isVisible()) {
        await btn.click({ force: true }).catch(() => {});
        botonUsado = true;
        console.log(`[Scraper] Botón: ${bs}`);
        break;
      }
    }
    if (!botonUsado) await input.press('Enter');

    // Polling de resultados — hasta 24 segundos
    let count = 0;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(1500);
      count = await page.$$eval('a.enlace-detalles', e => e.length).catch(() => 0);
      if (count > 0) { console.log(`[Scraper] ${count} fichas encontradas (${(i+1)*1.5}s)`); break; }
      if (i === 4) { await cerrarModal(page); await input.press('Enter'); }
      if (i === 8) {
        await page.screenshot({ path: `/tmp/sin-resultados-${marca}.png`, fullPage: true });
        const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
        console.log(`[Scraper] Sin resultados a los 12s. Texto visible: ${txt.substring(0, 200)}`);
      }
    }

    if (count === 0) {
      console.log(`[Scraper] 0 resultados para "${termino}"`);
      return [];
    }

    // Extraer fichas
    const fichas = await page.$$eval('a.enlace-detalles', (els) => {
      return els.slice(0, 10).map(el => {
        const card        = el.closest('.card');
        const fichaId     = el.id || '';
        const nombre      = card?.querySelector('.card-title-custom, h4.card-title')?.innerText?.trim() || '';
        const numeroParte = card?.querySelector('.card-title b, h5 b')?.innerText?.trim() || '';
        const imgUrl      = el.getAttribute('data-img')            || '';
        const pdfUrl      = el.getAttribute('data-file')           || '';
        const specsFp     = el.getAttribute('data-fp')             || '';
        const specsHtml   = el.getAttribute('data-feature')        || '';
        const estado      = el.getAttribute('data-status')         || '';
        const catalogo    = el.getAttribute('data-catalogue')      || '';
        const fechaPub    = el.getAttribute('data-published-date') || '';

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

        return { fichaId, nombre, numeroParte, imgUrl, pdfUrl, specsFp, specsObj, estado, catalogo, fechaPub };
      });
    });

    console.log(`[Scraper] Extraídas ${fichas.length} fichas de ${marca}`);
    return fichas;

  } catch (err) {
    console.error(`[Scraper] Error ${marca}:`, err.message);
    await page.screenshot({ path: `/tmp/error-${marca}.png` }).catch(() => {});
    return [];
  } finally {
    await browser.close();
  }
};

// ─────────────────────────────────────────────────────────────
// CERRAR MODAL #divPopUpComunicadoBloqueado
// ─────────────────────────────────────────────────────────────
const cerrarModal = async (page) => {
  try {
    if (!(await page.$('#divPopUpComunicadoBloqueado.show, #divPopUpComunicadoBloqueado[style*="block"]'))) return;
    console.log('[Scraper] Cerrando modal bloqueante...');

    // Método 1: Botón ×
    await page.click(
      '#divPopUpComunicadoBloqueado .close, #divPopUpComunicadoBloqueado [data-dismiss="modal"], #divPopUpComunicadoBloqueado button',
      { timeout: 3000, force: true }
    ).catch(() => {});
    await page.waitForTimeout(500);

    // Método 2: jQuery + DOM
    await page.evaluate(() => {
      try { if (typeof $ !== 'undefined') $('#divPopUpComunicadoBloqueado').modal('hide'); } catch(_) {}
      const m = document.getElementById('divPopUpComunicadoBloqueado');
      if (m) { m.classList.remove('show'); m.style.display = 'none'; m.setAttribute('aria-hidden','true'); }
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    });

    // Método 3: CSS nuclear
    await page.addStyleTag({ content: '#divPopUpComunicadoBloqueado,.modal-backdrop{display:none!important;pointer-events:none!important}body.modal-open{overflow:auto!important;padding-right:0!important}' });
    await page.waitForTimeout(300);
    console.log('[Scraper] Modal cerrado');
  } catch (_) {}
};

// ─────────────────────────────────────────────────────────────
// BASE DE DATOS
// ─────────────────────────────────────────────────────────────
const buscarEnDB = async (marca, tipo, limit) => {
  try {
    const r = await pool.query(
      `SELECT * FROM products
       WHERE LOWER(marca)=$1 AND LOWER(categoria)=$2
         AND ultima_actualizacion > NOW() - INTERVAL '24 hours'
       ORDER BY ultima_actualizacion DESC LIMIT $3`,
      [marca.toLowerCase(), tipo.toLowerCase(), limit]
    );
    return r.rows.map(row => ({
      fichaId:     row.ficha_id,
      nombre:      row.nombre,
      numeroParte: row.specs?.numeroParte || '',
      imgUrl:      row.specs?.imgUrl      || '',
      pdfUrl:      row.pdf_url || row.specs?.pdfUrl || '',
      specsFp:     row.specs?.specsFp     || '',
      specsObj:    row.specs?.specsObj    || {},
      estado:      row.specs?.estado      || '',
      catalogo:    row.specs?.catalogo    || '',
      categoria:   row.categoria          || tipo,
    }));
  } catch (e) {
    console.error('[Scraper] DB read error:', e.message);
    return [];
  }
};

const guardarEnDB = async (fichas, marca, tipo) => {
  for (const f of fichas) {
    if (!f.fichaId) continue;
    await pool.query(
      `INSERT INTO products (ficha_id,marca,nombre,categoria,specs,pdf_url,url_ficha,ultima_actualizacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (ficha_id) DO UPDATE
         SET nombre=$3,marca=$2,specs=$5,pdf_url=$6,ultima_actualizacion=NOW()`,
      [
        f.fichaId, marca, f.nombre, tipo,
        JSON.stringify({ numeroParte:f.numeroParte, imgUrl:f.imgUrl, pdfUrl:f.pdfUrl,
                         specsFp:f.specsFp, specsObj:f.specsObj, estado:f.estado, catalogo:f.catalogo }),
        f.pdfUrl,
        'https://buscadorcatalogos.perucompras.gob.pe/',
      ]
    ).catch(e => console.error('[Scraper] DB write error:', e.message));
  }
};

// ─────────────────────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD (usa specs del PDF si están disponibles)
// Solo retorna fichas con score >= 60 (iguales o superiores al req)
// ─────────────────────────────────────────────────────────────
const calcularScore = (ficha, req) => {
  const hayHtml = ((ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})).toLowerCase();
  const pdf     = ficha.pdfSpecs?.specs || {};

  let score = 0;

  // ══════════════════════════════════════════
  // PROCESADOR (30 puntos)
  // ══════════════════════════════════════════
  const modelos = (
    req.procesador?.modelos_aceptados ||
    [req.procesador?.modelo_principal, req.procesador?.modelo].filter(Boolean)
  ).map(m => (m || '').trim().toLowerCase()).filter(Boolean);

  let procScore = 0;
  for (const mod of modelos) {
    if (hayHtml.includes(mod) || (pdf.procesador_modelo || '').toLowerCase().includes(mod)) {
      procScore = 30; break;
    }
    // Match por familia (ultra 5, i7-13xxx, etc.)
    const familia = mod.match(/(ultra \d+|i[357]-?\d{4,5}|i[357] \d{4,5}|ryzen [579] \d{4})/)?.[0];
    if (familia) {
      if (hayHtml.includes(familia) || (pdf.procesador_modelo || '').toLowerCase().includes(familia)) {
        procScore = Math.max(procScore, 25);
      }
    }
    // Match por generación numérica
    const genReq  = parseInt(mod.match(/(\d{2})\d{3}/)?.[1] || mod.match(/(?:ultra|series)\s*(\d)/i)?.[1] || '0');
    const genFicha = pdf.procesador_generacion || 0;
    if (genFicha >= genReq && genFicha > 0 && genReq > 0) procScore = Math.max(procScore, 28);
    // Fuzzy: ultra, i7, i5
    if (procScore === 0) {
      if (mod.includes('ultra') && hayHtml.includes('ultra'))  procScore = Math.max(procScore, 22);
      else if (mod.includes('i7') && hayHtml.includes('i7'))   procScore = Math.max(procScore, 20);
      else if (mod.includes('i5') && hayHtml.includes('i5'))   procScore = Math.max(procScore, 12);
    }
  }
  score += procScore;

  // ══════════════════════════════════════════
  // RAM (25 puntos)
  // ══════════════════════════════════════════
  const ramReq   = req.memoria_ram?.capacidad_gb || 0;
  const tipoReq  = (req.memoria_ram?.tipo || '').toUpperCase();
  if (ramReq > 0) {
    const ramFichaGb = pdf.ram_gb || gbDesdeTexto(hayHtml.match(/(\d+)\s*gb\s*(ddr|ram)/i)?.[0] || '');
    const tipoFicha  = (pdf.ram_tipo || hayHtml.match(/(ddr[45]|lpddr[45]x?)/i)?.[1] || '').toUpperCase();

    if (ramFichaGb >= ramReq) score += 20;
    else if (ramFichaGb > 0) score += Math.round((ramFichaGb / ramReq) * 12);

    if (tipoFicha && tipoReq) {
      const tipoPts = tipoFicha === tipoReq ? 5
                    : (tipoFicha === 'DDR5' && tipoReq === 'DDR4') ? 5
                    : (tipoFicha === 'DDR4' && tipoReq === 'DDR5') ? -5
                    : 0;
      score += tipoPts;
    }
  } else {
    score += 25; // Sin requisito de RAM → no penalizar
  }

  // ══════════════════════════════════════════
  // ALMACENAMIENTO (20 puntos)
  // ══════════════════════════════════════════
  const stReqs  = Array.isArray(req.almacenamiento) ? req.almacenamiento : [req.almacenamiento].filter(Boolean);
  const stFicha = pdf.almacenamiento?.length > 0
    ? pdf.almacenamiento
    : [{
        gb:   hayHtml.includes('1 tb') || hayHtml.includes('1tb') ? 1000 : gbDesdeTexto(hayHtml.match(/(\d+)\s*gb\s*ssd/i)?.[0] || ''),
        tipo: /nvme|m\.2/.test(hayHtml) ? 'NVMe SSD' : /ssd/.test(hayHtml) ? 'SSD' : 'HDD',
      }];

  let stScore = 0;
  for (const req_st of stReqs) {
    if (!req_st?.capacidad_gb) continue;
    const cubre = stFicha.some(f => f.gb >= req_st.capacidad_gb && !(req_st.tipo === 'SSD' && f.tipo === 'HDD'));
    if (cubre) {
      stScore += Math.round(20 / stReqs.length);
    } else {
      const mejor = stFicha.reduce((mx, f) => f.gb > mx ? f.gb : mx, 0);
      if (mejor > 0) stScore += Math.round((mejor / req_st.capacidad_gb) * (10 / stReqs.length));
    }
  }
  score += Math.min(stScore, 20);

  // ══════════════════════════════════════════
  // GRÁFICA (10 puntos)
  // ══════════════════════════════════════════
  const grafReq   = req.grafica?.tipo;
  const grafFicha = pdf.grafica_tipo || (hayHtml.includes('integrad') ? 'integrada' : null);

  if (!grafReq || grafReq === 'integrada' || req.grafica?.opcional_dedicada) {
    score += 10;
  } else if (grafReq === 'dedicada' && grafFicha === 'dedicada') {
    const vramReq   = req.grafica?.vram_gb || 0;
    const vramFicha = pdf.grafica_vram_gb  || gbDesdeTexto(hayHtml.match(/(\d+)\s*gb\s*(gddr|vram)/i)?.[0] || '');
    score += vramFicha >= vramReq ? 10 : 5;
  }

  // ══════════════════════════════════════════
  // SISTEMA OPERATIVO (10 puntos)
  // ══════════════════════════════════════════
  const soReq   = (req.sistema_operativo || '').toLowerCase();
  const soFicha = (pdf.so_texto || hayHtml).toLowerCase();
  if (soReq.includes('windows') && soFicha.includes('windows')) {
    score += 7;
    if      (soReq.includes('11') && soFicha.includes('11')) score += 3;
    else if (soReq.includes('10') && soFicha.includes('10')) score += 2;
  }

  // ══════════════════════════════════════════
  // CONECTIVIDAD (5 puntos)
  // ══════════════════════════════════════════
  const conn = req.conectividad || {};
  if (conn.lan  === true && hayHtml.includes('lan: si'))  score += 2;
  if (conn.hdmi === true && hayHtml.includes('hdmi: si')) score += 2;
  if (conn.usb  === true && hayHtml.includes('usb: si'))  score += 1;

  // ══════════════════════════════════════════
  // GARANTÍA (5 puntos bonus)
  // ══════════════════════════════════════════
  const garMin   = req.garantia_min_meses || 0;
  const garFicha = pdf.garantia_meses     || 0;
  if (garFicha >= garMin && garMin > 0) score += 5;

  // Ofertada bonus
  if ((ficha.estado || '').toLowerCase() === 'ofertada') score += 3;

  return Math.min(Math.round(score), 100);
};

const gbDesdeTexto = (t) => {
  if (!t) return 0;
  const tb = (t + '').match(/(\d+(?:\.\d+)?)\s*tb/i);
  if (tb) return parseFloat(tb[1]) * 1000;
  const gb = (t + '').match(/(\d+)\s*gb/i);
  return gb ? parseInt(gb[1]) : 0;
};

module.exports = { searchCompatibleProducts };
