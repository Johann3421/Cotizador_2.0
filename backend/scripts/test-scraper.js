// scripts/test-scraper.js
// Prueba rápida del scraper DOM-based
// Ejecutar con: node scripts/test-scraper.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { searchFichasByMarcaYTipo } = require('../src/services/scraperService');

(async () => {
  const MARCA = process.argv[2] || 'kenya';
  const TIPO  = process.argv[3] || 'desktop';
  const LIMIT = parseInt(process.argv[4]) || 5;

  console.log(`\n🧪 Probando scraper — marca="${MARCA}" tipo="${TIPO}" limit=${LIMIT}\n`);

  const t0 = Date.now();
  const fichas = await searchFichasByMarcaYTipo(MARCA, TIPO, LIMIT);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (fichas.length === 0) {
    console.log('❌ No se encontraron fichas. Revisar:');
    console.log('   1. Screenshot de diagnóstico → /tmp/scraper-waiting-kenya.png');
    console.log('   2. HTML de diagnóstico      → /tmp/scraper-no-input.html');
    console.log('   3. Aumentar SCRAPER_WAIT_RESULTS en .env (probar 15000)');
    console.log('   4. Verificar que .enlace-detalles existe en el DOM');
    process.exit(1);
  }

  fichas.forEach((f, i) => {
    console.log(`\n📦 Ficha ${i + 1} — ${f.fichaId}`);
    console.log(`  Nombre:    ${f.nombre}`);
    console.log(`  Parte:     ${f.numeroParte}`);
    console.log(`  Estado:    ${f.estado}`);
    console.log(`  PDF URL:   ${f.pdfUrl || '⚠️  VACÍO — data-file no encontrado'}`);
    console.log(`  Specs obj: ${JSON.stringify(f.specsObj).substring(0, 150)}`);
    if (f.specsFp) {
      console.log(`  Specs txt: ${f.specsFp.substring(0, 200)}`);
    }
  });

  console.log(`\n✅ ${fichas.length} ficha(s) en ${elapsed}s`);

  // Verificar que pdfUrl está presente en todas las fichas
  const sinPdf = fichas.filter(f => !f.pdfUrl).length;
  if (sinPdf > 0) {
    console.log(`\n⚠️  ${sinPdf} ficha(s) sin pdfUrl — el atributo data-file puede estar vacío en esas cards.`);
  } else {
    console.log('✅ Todas las fichas tienen pdfUrl.');
  }

  process.exit(0);
})();
