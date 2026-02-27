// backend/scripts/seed.js
// Ejecutar con: node scripts/seed.js
// Ejecutar solo producción: node scripts/seed.js --prod

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
const isProd = process.argv.includes('--prod');

/**
 * Ejecuta un seeder en su propia transacción.
 * Si falla, hace rollback solo de ese seeder y continúa con los demás.
 */
async function runSeeder(name, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`\n❌ Error en [${name}]`);
    console.error(`   Mensaje:  ${err.message}`);
    if (err.detail)  console.error(`   Detalle:  ${err.detail}`);
    if (err.hint)    console.error(`   Hint:     ${err.hint}`);
    if (err.code)    console.error(`   PG Code:  ${err.code}`);
    console.error(`   Stack:\n${err.stack}`);
    return false;
  } finally {
    client.release();
  }
}

const run = async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  KENYA COTIZADOR — DATABASE SEEDERS');
  console.log(`  Entorno: ${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('═══════════════════════════════════════════\n');

  const results = [];

  // Seeder 1: Superadmin (siempre)
  results.push(await runSeeder('01_superadmin', require('./seeds/01_superadmin').run));

  // Seeders de desarrollo (omitir con --prod)
  if (!isProd) {
    results.push(await runSeeder('02_test_users', require('./seeds/02_test_users').run));
    results.push(await runSeeder('03_test_data',  require('./seeds/03_test_data').run));
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
  process.exit(failed > 0 ? 1 : 0);
};

run();
