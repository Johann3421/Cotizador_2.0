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
  monitor:      { kenya: 'monitor kenya',                    samsung: 'monitor samsung',                  lg: 'monitor lg'                    },
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
  const tipo    = (specs.tipo_equipo || 'desktop').toLowerCase();
  const MARCAS  = tipo === 'monitor' ? ['kenya', 'samsung', 'lg'] : ['kenya', 'lenovo', 'hp'];
  const result  = {};

  for (const marca of MARCAS) {
    // 1. Obtener fichas de DB o scraping
    let fichas = await buscarEnDB(marca, tipo, 20);
    if (fichas.length === 0) {
      // Término enriquecido: incluye almacenamiento normalizado (1tb, 512gb, etc.)
      const termino = construirTermino(marca, tipo, specs);
      console.log(`[Scraper] DB vacía para ${marca}/${tipo} → scraping: "${termino}"`);
      fichas = await scrapearMarca(marca, tipo, termino !== TERMINOS[tipo]?.[marca] ? termino : null);
      if (fichas.length > 0) await guardarEnDB(fichas, marca, tipo);
    }

    if (fichas.length === 0) {
      result[marca] = [];
      continue;
    }

    // 2. Cargar specs del PDF en batches de 3
    console.log(`[Scraper] Cargando PDFs para ${fichas.length} fichas de ${marca}...`);
    for (let i = 0; i < fichas.length; i += 3) {
      const batch = fichas.slice(i, i + 3);
      await Promise.all(batch.map(async (f) => {
        if (f.pdfUrl && !f.pdfSpecs) {
          f.pdfSpecs = await extraerSpecsDePdf(f.pdfUrl);
          if (f.pdfSpecs?.specs?.grafica_tipo) {
            console.log(`[Scraper] ${(f.nombre || '').substring(0, 30)}: gráfica=${f.pdfSpecs.specs.grafica_tipo}${f.pdfSpecs.specs.grafica_vram_gb ? ' ' + f.pdfSpecs.specs.grafica_vram_gb + 'GB' : ''}, RAM=${f.pdfSpecs.specs.ram_gb}GB ${f.pdfSpecs.specs.ram_tipo || ''}`);
          }
        }
      }));
      if (i + 3 < fichas.length) await new Promise(r => setTimeout(r, 300));
    }

    // 3. Calcular scores y filtrar fichas iguales o superiores (score >= 50)
    const conScore = fichas.map(f => ({ ...f, score: calcularScore(f, specs) }));
    const compatibles = conScore
      .filter(f => f.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    result[marca] = compatibles;
    const scores = conScore.map(f => f.score).sort((a, b) => b - a);
    console.log(`[Scraper] ${marca}: ${compatibles.length} compatibles de ${fichas.length} — scores: [${scores.join(', ')}]`);
  }

  // ── BÚSQUEDA OCULTA POR NÚMERO DE PARTE / MODELO DE REFERENCIA ──────────
  if (specs.modelo_referencia) {
    try {
      const termRef = specs.modelo_referencia.trim();
      console.log(`[Scraper] Búsqueda por referencia: "${termRef}"`);
      const fichasRef = await scrapearMarca('ref', tipo, termRef);

      for (const f of fichasRef) {
        const marcaFicha = detectarMarcaDesdeNombre(f.nombre);
        if (!marcaFicha || !result[marcaFicha]) continue;
        // Evitar duplicados
        if (result[marcaFicha].some(x => x.fichaId === f.fichaId)) continue;
        // Cargar PDF specs si no viene en cache
        if (f.pdfUrl && !f.pdfSpecs) {
          f.pdfSpecs = await extraerSpecsDePdf(f.pdfUrl).catch(() => null);
        }

        // ── VALIDACIÓN EXTRA PARA BÚSQUEDA POR REFERENCIA ─────────────
        // Verificar que el procesador de la ficha encontrada sea >= al requerido
        const modelos_req = (specs.procesador?.modelos_aceptados ||
          [specs.procesador?.modelo_principal, specs.procesador?.modelo].filter(Boolean));
        const modeloFicha = f.pdfSpecs?.specs?.procesador_modelo || '';
        if (modelos_req.length > 0 && modeloFicha) {
          const procScore = getProcScore(modeloFicha, f.pdfSpecs?.specs?.procesador_generacion || 0, modelos_req);
          if (procScore === 0) {
            console.log(`[Scraper] Ref DESCARTADA: ${(f.nombre || '').substring(0, 40)} → procesador inferior (procScore=0)`);
            continue; // Procesador inferior → no incluir
          }
        }

        const fConScore = { ...f, score: calcularScore(f, specs) };
        if (fConScore.score >= 50) {
          result[marcaFicha].push(fConScore);
          result[marcaFicha].sort((a, b) => b.score - a.score);
          if (result[marcaFicha].length > 10) result[marcaFicha] = result[marcaFicha].slice(0, 10);
          console.log(`[Scraper] Ref +${(f.nombre || '').substring(0, 30)} → ${marcaFicha} score=${fConScore.score}`);
        }
      }
    } catch (e) {
      console.warn('[Scraper] Error búsqueda referencia:', e.message);
    }
  }

  return result;
};

// ─────────────────────────────────────────────────────────────
// SCRAPING DE UNA MARCA
// ─────────────────────────────────────────────────────────────
const scrapearMarca = async (marca, tipo, terminoPersonalizado = null) => {
  const termino = terminoPersonalizado || TERMINOS[tipo]?.[marca];
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
      return els.slice(0, 15).map(el => {
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
// PARSEAR data-fp (texto del card HTML) — fuente rápida sin HTTP
// Formato: "PROCESADOR: ... RAM: ... ALMACENAMIENTO: ... LAN: SI..."
// ─────────────────────────────────────────────────────────────
const parsearDataFp = (dataFp) => {
  if (!dataFp) return {};
  const spec = {};

  const proc = dataFp.match(/PROCESADOR[:\s]+(.+?)(?:RAM|ALMACENAMIENTO|LAN|WLAN|USB|$)/i);
  if (proc) spec.procesador_fp = proc[1].trim();

  const ram = dataFp.match(/RAM[:\s]+(\d+)\s*GB\s*(DDR[45]?)/i);
  if (ram) { spec.ram_gb_fp = parseInt(ram[1]); spec.ram_tipo_fp = ram[2].toUpperCase(); }

  const st = dataFp.match(/ALMACENAMIENTO[:\s]+(\d+)\s*(GB|TB)\s*(SSD|NVMe|HDD)?/i);
  if (st) {
    const mult = st[2].toUpperCase() === 'TB' ? 1000 : 1;
    spec.st_gb_fp   = parseInt(st[1]) * mult;
    spec.st_tipo_fp = st[3] || 'SSD';
  }

  const tUp = dataFp.toUpperCase();
  if      (tUp.includes('WINDOWS 11')) spec.so_fp = 'Windows 11';
  else if (tUp.includes('WINDOWS 10')) spec.so_fp = 'Windows 10';

  spec.lan_fp = /LAN[:\s]+SI/i.test(dataFp);

  return spec;
};

// ─────────────────────────────────────────────────────────────
// TIER SCORES — cuánto vale cada familia de CPU
// ─────────────────────────────────────────────────────────────
const TIER_SCORE = {
  // Intel Core Ultra (desktop: Series 2 = Arrow Lake 2024)
  'ultra 9': 10, 'ultra 7': 8, 'ultra 5': 6,
  // Intel Core clásico (hasta 14th gen, no existe 15th+)
  'i9': 9, 'i7': 7, 'i5': 5, 'i3': 3,
  // AMD
  'ryzen 9': 9, 'ryzen 7': 7, 'ryzen 5': 5, 'ryzen 3': 3,
};

/**
 * Extrae generación y tier de un procesador.
 * rawGen:
 *   Intel clásico (12th-14th)  → rawGen = gen (12, 13, 14)
 *   Core Ultra Series 1 (100)  → rawGen = 15
 *   Core Ultra Series 2 (200)  → rawGen = 16
 *   AMD                        → rawGen = serie (5=Zen3, 7=Zen4, 8=Zen4+)
 */
const parsearProcesador = (texto) => {
  if (!texto) return null;
  const t = texto.toLowerCase()
    .replace(/[®™°ªfk]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // ── Intel Core Ultra (Arrow Lake S2, Meteor Lake S1) ──────
  // "Core Ultra 5 245K", "Core Ultra 7 265K", "Ultra 5 125H"
  const ultraMatch = t.match(/(?:core\s+)?ultra\s+([579])\s+(\d{3})\w*/);
  if (ultraMatch) {
    const tierNum   = parseInt(ultraMatch[1]);            // 5, 7 o 9
    const numModelo = parseInt(ultraMatch[2]);            // 245, 265, 125…
    const series    = numModelo >= 200 ? 2 : 1;
    const tier      = `ultra ${tierNum}`;
    const rawGen    = series === 2 ? 16 : 15;            // S2=16, S1=15
    return { gen: rawGen, tier, tierScore: TIER_SCORE[tier] || 6, rawGen };
  }

  // ── Intel Core clásico (12th – 14th gen) ──────────────────
  // "Core i7-13700", "Core i5-14400", "i9-14900K"
  const intelMatch = t.match(/(?:core\s+)?([i][3579])-?(\d{2})(\d{2,3})/);
  if (intelMatch) {
    const tier = intelMatch[1];                          // 'i3','i5','i7','i9'
    const gen  = parseInt(intelMatch[2]);                // 12, 13, 14
    return { gen, tier, tierScore: TIER_SCORE[tier] || 0, rawGen: gen };
  }

  // ── AMD Ryzen ──────────────────────────────────────────────
  // "Ryzen 5 5600", "Ryzen 7 8700G", "Ryzen 9 7950X"
  const amdMatch = t.match(/ryzen\s+([3579])\s+(\d)(\d{3})\w*/);
  if (amdMatch) {
    const tierNum = parseInt(amdMatch[1]);               // 3, 5, 7, 9
    const genNum  = parseInt(amdMatch[2]);               // 5=Zen3, 7=Zen4, 8=Zen4+
    const tier    = `ryzen ${tierNum}`;
    return { gen: genNum, tier, tierScore: TIER_SCORE[tier] || 0, rawGen: genNum };
  }

  return null;
};

/**
 * Compara procesador de la ficha vs lista de modelos requeridos.
 * Retorna score 0-30.
 *
 * rawGen ficha < req               → 0   (generación inferior, descartar)
 * rawGen ficha == req, tier igual  → 25
 * rawGen ficha == req, tier +1     → 26
 * rawGen ficha == req, tier +2+    → 28
 * rawGen ficha == req, tier menor  → 0   (inferior, descartar)
 * rawGen ficha >  req, tier >=     → 29-30
 * rawGen ficha >  req, tier -1     → 15-20 (gen compensa uno)
 * rawGen ficha >  req, tier -2+    → 0
 * Sin info / arq diferente         → neutral (10-20)
 */
const getProcScore = (fichaTexto, _genFromPdf, modelos_req) => {
  const fichaParsed = parsearProcesador(fichaTexto);
  if (!fichaParsed) return 5;    // sin info verificable → penalizar (requiere PDF o data-fp válidos)

  const reqs = modelos_req.map(m => parsearProcesador(m)).filter(Boolean);
  if (reqs.length === 0) return 20; // sin requisito → no penalizar

  // Si la arquitectura es totalmente distinta (Intel vs AMD) → neutral
  const fichaEsIntel = fichaParsed.tier.startsWith('i') || fichaParsed.tier.startsWith('ultra');
  const fichaEsAmd   = fichaParsed.tier.startsWith('ryzen');

  let mejorScore = 0;

  for (const req of reqs) {
    const reqEsIntel = req.tier.startsWith('i') || req.tier.startsWith('ultra');
    const reqEsAmd   = req.tier.startsWith('ryzen');

    // Arquitecturas distintas → neutral (no penalizar ni premiar)
    if ((fichaEsIntel && reqEsAmd) || (fichaEsAmd && reqEsIntel)) {
      mejorScore = Math.max(mejorScore, 10);
      continue;
    }

    const genFicha = fichaParsed.rawGen;
    const genReq   = req.rawGen;
    const diffTier = fichaParsed.tierScore - req.tierScore;
    let s = 0;

    if (genFicha < genReq) {
      // ❌ Generación inferior → descarte absoluto
      s = 0;

    } else if (genFicha === genReq) {
      // Misma generación → tier decide
      if (diffTier >= 2)        s = 28;  // tier mucho mayor (i9 vs i5)
      else if (diffTier === 1)  s = 26;  // tier un escalón mayor (i7 vs i5)
      else if (diffTier === 0)  s = 25;  // tier exactamente igual
      else                      s = 0;   // tier menor → descartar

    } else {
      // Generación superior → más permisivo con tier
      const genDiff = genFicha - genReq;
      if (diffTier >= 1)       s = 30;                           // gen mayor Y tier mayor
      else if (diffTier === 0) s = 29;                           // gen mayor, tier igual
      else if (diffTier === -1) s = genDiff >= 2 ? 20 : 15;     // tier -1 pero gen 2+
      else                     s = 0;                            // tier muy inferior
    }

    mejorScore = Math.max(mejorScore, s);
  }

  return mejorScore;
};

// ─────────────────────────────────────────────────────────────
// SCORE DE COMPATIBILIDAD — Compara ficha vs requerimiento
// Usa PDF specs si disponibles, data-fp como fallback
// SOLO retorna score >= 50 (fichas iguales o superiores)
// ─────────────────────────────────────────────────────────────
const calcularScore = (ficha, req) => {
  let score = 0;
  const pdf  = ficha.pdfSpecs?.specs || {};
  const fp   = parsearDataFp(ficha.specsFp);
  const html = ((ficha.specsFp || '') + ' ' + JSON.stringify(ficha.specsObj || {})).toLowerCase();

  // ════════════════════════════════════════
  // PROCESADOR (30 pts)
  // ════════════════════════════════════════
  const modelos_req = (req.procesador?.modelos_aceptados ||
    [req.procesador?.modelo_principal, req.procesador?.modelo].filter(Boolean));

  const modeloFicha = pdf.procesador_modelo || fp.procesador_fp || '';
  const procScore = getProcScore(modeloFicha, pdf.procesador_generacion || 0, modelos_req);
  // REGLA DURA: procesador inferior detectado → descartar completamente
  if (procScore === 0) return 0;
  score += procScore;

  // ════════════════════════════════════════
  // RAM (25 pts)
  // ════════════════════════════════════════
  const ramReq_gb   = req.memoria_ram?.capacidad_gb || 0;
  const ramReq_tipo = (req.memoria_ram?.tipo || '').toUpperCase();
  const ramFicha_gb   = pdf.ram_gb || fp.ram_gb_fp || 0;
  const ramFicha_tipo = (pdf.ram_tipo || fp.ram_tipo_fp || '').toUpperCase();

  if (ramReq_gb > 0) {
    if (ramFicha_gb >= ramReq_gb) {
      score += 20;
      if (!ramReq_tipo || ramFicha_tipo === ramReq_tipo) score += 5;
      else if (ramFicha_tipo === 'DDR5' && ramReq_tipo === 'DDR4') score += 5;
      else if (ramFicha_tipo === 'DDR4' && ramReq_tipo === 'DDR5') score += 1;
    } else if (ramFicha_gb > 0) {
      // RAM inferior → penalizar proporcional
      const ratio = ramFicha_gb / ramReq_gb;
      if (ratio >= 0.5) score += Math.round(ratio * 15);
      // ratio < 0.5 → 0 puntos (RAM muy inferior)
    }
    // ramFicha_gb === 0 (sin info de RAM) → dar score mínimo en vez de neutral
    if (ramFicha_gb === 0) score += 8;
  } else {
    score += 20;
  }

  // ════════════════════════════════════════
  // ALMACENAMIENTO (20 pts)
  // ════════════════════════════════════════
  const stReqs = Array.isArray(req.almacenamiento)
    ? req.almacenamiento
    : [{ capacidad_gb: req.almacenamiento?.capacidad_gb, tipo: req.almacenamiento?.tipo }].filter(r => r.capacidad_gb);

  const stFichas = pdf.almacenamiento?.length > 0
    ? pdf.almacenamiento
    : fp.st_gb_fp ? [{ gb: fp.st_gb_fp, tipo: fp.st_tipo_fp || 'SSD' }]
    : (() => {
        // Detectar TB primero (cualquier valor: 1tb, 2tb, 512gb, etc.)
        const tbM = html.match(/(\d+(?:\.\d+)?)\s*tb/i);
        if (tbM) return [{ gb: Math.round(parseFloat(tbM[1]) * 1000), tipo: html.includes('nvme') ? 'NVMe SSD' : 'SSD' }];
        const gbM = html.match(/(\d+)\s*gb\s*(?:nvme|ssd|hdd)/i);
        if (gbM) return [{ gb: parseInt(gbM[1]), tipo: /nvme/i.test(html) ? 'NVMe SSD' : 'SSD' }];
        return [];
      })();

  if (stReqs.length > 0 && stFichas.length > 0) {
    let stScore = 0;
    for (const reqSt of stReqs) {
      if (!reqSt?.capacidad_gb) continue;
      const cubre = stFichas.some(f => {
        if (f.gb < reqSt.capacidad_gb * 0.9) return false;
        if (reqSt.tipo === 'NVMe SSD' && f.tipo === 'HDD') return false;
        if (reqSt.tipo === 'SSD' && f.tipo === 'HDD') return false;
        return true;
      });
      if (cubre) stScore += Math.round(20 / stReqs.length);
    }
    score += Math.min(stScore, 20);
  } else {
    score += 15;
  }

  // ════════════════════════════════════════
  // GRÁFICA (15 pts) — SOLO disponible desde PDF
  // ════════════════════════════════════════
  const grafReq   = req.grafica?.tipo;
  const grafFicha = pdf.grafica_tipo;

  if (!grafFicha) {
    score += 5; // Sin info del PDF → penalizar levemente (antes era 8)
  } else if (!grafReq || grafReq === 'integrada' || req.grafica?.opcional_dedicada) {
    score += 15;
  } else if (grafReq === 'dedicada') {
    if (grafFicha === 'dedicada') {
      const vramReq   = req.grafica?.vram_gb || 0;
      const vramFicha = pdf.grafica_vram_gb  || 0;
      if (vramReq === 0 || vramFicha >= vramReq) score += 15;
      else if (vramFicha >= vramReq / 2) score += 8;
      else score += 3;
    }
    // integrada cuando piden dedicada → 0 pts
  }

  // ════════════════════════════════════════
  // SISTEMA OPERATIVO (10 pts)
  // ════════════════════════════════════════
  const soReq   = (req.sistema_operativo || '').toLowerCase();
  const soFicha = (pdf.so || fp.so_fp || html).toLowerCase();

  if (!soReq || soReq.length < 3) {
    score += 7;
  } else if (soReq.includes('windows') && soFicha.includes('windows')) {
    score += 7;
    if (soReq.includes('11') && soFicha.includes('11')) score += 3;
    else if (soReq.includes('11') && soFicha.includes('10')) score += 0;
    else score += 2;
  }

  return Math.min(Math.round(score), 100);
};

const gbDesdeTexto = (t) => {
  if (!t) return 0;
  const tb = (t + '').match(/(\d+(?:\.\d+)?)\s*tb/i);
  if (tb) return parseFloat(tb[1]) * 1000;
  const gb = (t + '').match(/(\d+)\s*gb/i);
  return gb ? parseInt(gb[1]) : 0;
};

// ─────────────────────────────────────────────────────────────
// DETECTAR MARCA DESDE NOMBRE DEL PRODUCTO
// ─────────────────────────────────────────────────────────────
const detectarMarcaDesdeNombre = (nombre) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('kenya'))    return 'kenya';
  if (n.includes('lenovo') || n.includes('thinkcentre') || n.includes('thinkpad') || n.includes('ideacentre')) return 'lenovo';
  if (/\bhp\b/.test(n) || n.includes('hewlett')) return 'hp';
  return null;
};

// ─────────────────────────────────────────────────────────────
// CONSTRUIR TÉRMINO DE BÚSQUEDA ENRIQUECIDO CON ALMACENAMIENTO
// Normaliza: 1000 GB → "1tb", 512 GB → "512gb"
// ─────────────────────────────────────────────────────────────
const construirTermino = (marca, tipo, specs) => {
  const base = TERMINOS[tipo]?.[marca] || '';
  const alm  = Array.isArray(specs.almacenamiento) ? specs.almacenamiento[0] : null;
  if (!alm?.capacidad_gb) return base;
  const termAlm = alm.capacidad_gb >= 1000
    ? `${Math.round(alm.capacidad_gb / 1000)}tb`
    : `${alm.capacidad_gb}gb`;
  return `${base} ${termAlm}`;
};

/**
 * Alias público para el refresh de catálogo desde el controlador
 */
const searchFichasByMarcaYTipo = async (marca, tipo, limit) => {
  const termino = TERMINOS[tipo]?.[marca] || `computadora ${marca}`;
  const fichas = await scrapearMarca(marca, tipo, termino);
  if (fichas.length > 0) await guardarEnDB(fichas, marca, tipo);
  return fichas.slice(0, limit || 20);
};

module.exports = { searchCompatibleProducts, searchFichasByMarcaYTipo };
