// backend/scripts/run-sync.js
// Ejecutar con: node scripts/run-sync.js
'use strict';

require('dotenv').config();
const { syncCatalogoBulk } = require('../src/services/bulkScraperService');

console.log('═══════════════════════════════════════════');
console.log('  SYNC MANUAL DEL CATÁLOGO PERUCOMPRAS');
console.log('═══════════════════════════════════════════');
console.log('Iniciando... esto puede tardar 3-5 minutos\n');

syncCatalogoBulk((progreso) => {
  console.log(`✅ ${progreso.categoria}: ${progreso.fichas} fichas (${progreso.nuevas} nuevas)`);
})
  .then(resumen => {
    console.log('\n═══════════════════════════════════════════');
    console.log('  SYNC COMPLETADO');
    console.log(`  Total fichas:  ${resumen.total}`);
    console.log(`  Nuevas:        ${resumen.nuevas}`);
    console.log(`  Actualizadas:  ${resumen.actualizadas}`);
    console.log(`  Duración:      ${resumen.duracion_segundos}s`);
    console.log('═══════════════════════════════════════════');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ ERROR EN SYNC:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
