// backend/scripts/seed.js
// Ejecutar con: node scripts/seed.js
// Ejecutar solo producción: node scripts/seed.js --prod

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const isProd = process.argv.includes('--prod');

const run = async () => {
  console.log('═══════════════════════════════════════════');
  console.log('  KENYA COTIZADOR — DATABASE SEEDERS');
  console.log(`  Entorno: ${isProd ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('═══════════════════════════════════════════\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Seeder 1: Superadmin (siempre se ejecuta)
    const seed01 = require('./seeds/01_superadmin');
    await seed01.run(client);

    // Seeders de desarrollo (solo si NO es producción)
    if (!isProd) {
      const seed02 = require('./seeds/02_test_users');
      await seed02.run(client);

      const seed03 = require('./seeds/03_test_data');
      await seed03.run(client);
    }

    await client.query('COMMIT');
    console.log('\n✅ Todos los seeders ejecutados exitosamente');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en seeder — ROLLBACK aplicado:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
};

run();
