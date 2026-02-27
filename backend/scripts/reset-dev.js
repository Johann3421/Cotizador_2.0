// backend/scripts/reset-dev.js
// ⚠️ ELIMINA todos los usuarios y datos de prueba. NUNCA usar en producción.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Este script NO puede ejecutarse en producción');
  process.exit(1);
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM quote_requests');
    await client.query("DELETE FROM users WHERE email != 'admin@kenya.com'");
    await client.query('COMMIT');
    console.log('✅ Datos de prueba eliminados (superadmin preservado)');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
