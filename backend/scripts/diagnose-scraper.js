/**
 * Diagnóstico del scraper de PeruCompras
 * ========================================
 * Ejecuta con: node scripts/diagnose-scraper.js
 * (dentro del contenedor Docker o donde esté el backend)
 *
 * En servidor sin pantalla: headless debe ser true (por defecto aquí).
 * Para modo visual (local con display): cambiar HEADLESS=false abajo.
 */

const { chromium } = require('playwright');

const HEADLESS = process.env.HEADLESS !== 'false'; // true por defecto
const BASE_URL = 'https://buscadorcatalogos.perucompras.gob.pe';
const CATALOGO  = 'EXT-CE-2022-5';

(async () => {
  console.log('\n🔍 Iniciando diagnóstico del scraper de PeruCompras...');
  console.log(`   headless=${HEADLESS}  base=${BASE_URL}\n`);

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const capturedRequests  = [];
  const capturedResponses = [];

  page.on('request', (req) => {
    const url = req.url();
    if (!url.match(/\.(js|css|png|jpg|svg|ico|woff2?)(\?.*)?$/)) {
      capturedRequests.push({ method: req.method(), url });
      console.log(`  → REQ  ${req.method()} ${url}`);
    }
  });

  page.on('response', async (res) => {
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json')) {
      try {
        const body = await res.json();
        capturedResponses.push({ url: res.url(), status: res.status(), body });
        console.log(`  ← JSON ${res.status()} ${res.url()}`);
        console.log(`         Preview: ${JSON.stringify(body).substring(0, 300)}\n`);
      } catch (_) {}
    }
  });

  try {
    // ── 1. Página principal ──────────────────────────────────────────
    console.log(`\n[1] Navegando a ${BASE_URL} ...`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);

    const html = await page.content();
    console.log(`\n[2] HTML inicial (primeros 2000 chars):\n${html.substring(0, 2000)}\n`);

    // ── 2. Inputs presentes ──────────────────────────────────────────
    const inputs = await page.$$eval('input', (els) =>
      els.map((e) => ({ type: e.type, placeholder: e.placeholder, id: e.id, name: e.name, class: e.className }))
    );
    console.log('\n[3] Inputs presentes:', JSON.stringify(inputs, null, 2));

    // ── 3. Textos visibles de la página ──────────────────────────────
    const texts = await page.$$eval('*', (els) =>
      els
        .filter((e) => !e.children.length && e.innerText?.trim())
        .map((e) => e.innerText.trim())
        .filter((t) => t.length > 2 && t.length < 120)
        .slice(0, 60)
    );
    console.log('\n[4] Textos visibles:', JSON.stringify(texts, null, 2));

    // ── 4. Intentar click en catálogo EXT-CE-2022-5 ─────────────────
    console.log(`\n[5] Intentando click en "${CATALOGO}"...`);
    let clicked = false;
    for (const loc of [
      `text="${CATALOGO}"`,
      `text=${CATALOGO}`,
      `*:has-text("${CATALOGO}")`,
    ]) {
      try {
        await page.click(loc, { timeout: 5000 });
        clicked = true;
        console.log(`    ✅ Click exitoso con selector: ${loc}`);
        break;
      } catch (e) {
        console.log(`    ❌ Fallo con "${loc}": ${e.message.split('\n')[0]}`);
      }
    }

    if (!clicked) {
      console.log(`\n    No se pudo hacer clic en el catálogo.`);
      console.log(`    Intentando navegación directa a: ${BASE_URL}/?catalogo=${CATALOGO}`);
      await page.goto(`${BASE_URL}/?catalogo=${CATALOGO}`, { waitUntil: 'networkidle', timeout: 45000 });
    }

    await page.waitForTimeout(3000);

    // ── 5. Inputs después del clic ───────────────────────────────────
    const inputs2 = await page.$$eval('input', (els) =>
      els.map((e) => ({ type: e.type, placeholder: e.placeholder, id: e.id, name: e.name }))
    );
    console.log('\n[6] Inputs DESPUÉS del clic en catálogo:', JSON.stringify(inputs2, null, 2));

    // ── 6. Intentar búsqueda ─────────────────────────────────────────
    const SELECTORS = [
      'input[placeholder*="Buscar" i]',
      'input[placeholder*="producto" i]',
      'input[type="search"]',
      '[class*="search"] input',
      'input[type="text"]',
    ];
    let searchEl = null;
    let usedSel  = null;
    for (const sel of SELECTORS) {
      try {
        const el = await page.$(sel);
        if (el) { searchEl = el; usedSel = sel; break; }
      } catch (_) {}
    }

    if (searchEl) {
      console.log(`\n[7] Campo de búsqueda encontrado: "${usedSel}"`);
      await searchEl.fill(`computadora portatil lenovo`);
      await searchEl.press('Enter');
      await page.waitForTimeout(4000);
      console.log('[7] Búsqueda ejecutada: "computadora portatil lenovo"');
    } else {
      console.log('\n[7] ❌ No se encontró campo de búsqueda');
    }

    // ── 7. Resultado ─────────────────────────────────────────────────
    console.log('\n[8] HTML después de búsqueda (primeros 3000 chars):');
    console.log((await page.content()).substring(0, 3000));

    // ── 8. Resumen ───────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════');
    console.log('RESUMEN');
    console.log('════════════════════════════════════════════════════');
    console.log(`\n📡 APIs encontradas (${capturedResponses.length} respuestas JSON):`);
    capturedResponses.forEach((r) => {
      console.log(`   ${r.status} ${r.url}`);
      console.log(`       ${JSON.stringify(r.body).substring(0, 400)}`);
    });

    if (capturedResponses.length > 0) {
      console.log('\n✅ Copia la URL del API en tu .env como:');
      console.log('   PERUCOMPRAS_API_URL=<url-encontrada>');
    } else {
      console.log('\n⚠️  No se capturó ninguna respuesta JSON de la API.');
      console.log('   Revisa el HTML impreso arriba para ajustar los selectores.');
    }

  } catch (err) {
    console.error('\n❌ Error en diagnóstico:', err.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Diagnóstico completado.');
  }
})();
