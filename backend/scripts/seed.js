// backend/scripts/seed.js
// Ejecutar con: node scripts/seed.js
// Ejecutar solo producción: node scripts/seed.js --prod

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

/**
 * Ejecuta un seeder en su propia transacción.
 * Si falla, hace rollback solo de ese seeder y continúa con los demás.
 */
async function runSeeder(pool, name, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error(`\n❌ Error en [${name}]`);
    console.error(`   Mensaje:  ${err.message}`);
    if (err.detail) console.error(`   Detalle:  ${err.detail}`);
    if (err.hint) console.error(`   Hint:     ${err.hint}`);
    if (err.code) console.error(`   PG Code:  ${err.code}`);
    console.error(`   Stack:\n${err.stack}`);
    return false;
  } finally {
    client.release();
  }
}

async function runSeeders(isProd = false) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log('═══════════════════════════════════════════');
  console.log('  KENYA COTIZADOR — DATABASE SEEDERS');
  console.log(`  Entorno: ${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('═══════════════════════════════════════════\n');

  const results = [];

  // Seeder 1: Superadmin (siempre)
  results.push(await runSeeder(pool, '01_superadmin', require('./seeds/01_superadmin').run));

  // Seeder 2: Trial User (siempre)
  results.push(await runSeeder(pool, '02_trialuser', require('./seeds/02_trialuser').run));

  // Seeders de desarrollo (omitir con --prod)
  if (!isProd) {
    results.push(await runSeeder(pool, '02_test_users', require('./seeds/02_test_users').run));
    results.push(await runSeeder(pool, '03_test_data', require('./seeds/03_test_data').run));
  }

  console.log('\n═══════════════════════════════════════════');
  const failed = results.filter(r => !r).length;
  if (failed === 0) {
    console.log('  ✅ Todos los seeders ejecutados sin errores');
  } else {
    console.log(`  ⚠️  ${failed} seeder(s) fallaron — revisar errores arriba`);
  }
  console.log('═══════════════════════════════════════════');

  await pool.end();
  return { success: failed === 0, failed };
}

// Permitir ejecución como script independiente
if (require.main === module) {
  const isProd = process.argv.includes('--prod');
  runSeeders(isProd)
    .then(res => process.exit(res.success ? 0 : 1))
    .catch(err => {
      console.error('Fatal error en seeders:', err);
      process.exit(1);
    });
}

module.exports = { runSeeders };
