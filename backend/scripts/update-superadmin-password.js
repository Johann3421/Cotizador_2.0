// backend/scripts/update-superadmin-password.js
// Safe utility to update superadmin password
// Usage: node scripts/update-superadmin-password.js [email] [new-password]

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const run = async () => {
  const email = process.argv[2] || 'admin@kenya.com';
  const password = process.argv[3] || 'Kenya2024!';

  if (!email || !password) {
    console.error('❌ Uso: node scripts/update-superadmin-password.js [email] [password]');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Verificar que existe y es superadmin
    const user = await client.query(
      'SELECT id, rol FROM users WHERE email = $1',
      [email]
    );

    if (user.rows.length === 0) {
      console.error(`❌ Usuario ${email} no encontrado`);
      process.exit(1);
    }

    if (user.rows[0].rol !== 'superadmin') {
      console.error(`❌ El usuario ${email} no es superadmin (es ${user.rows[0].rol})`);
      process.exit(1);
    }

    // Actualizar password
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hash = await bcrypt.hash(password, rounds);

    await client.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hash, email]
    );

    console.log(`✅ Contraseña actualizada para ${email}`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role:     superadmin`);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
