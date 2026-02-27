// backend/scripts/seeds/01_superadmin.js
const bcrypt = require('bcrypt');

// ══════════════════════════════════════════════════════════════
// CREDENCIALES DEL SUPERADMIN INICIAL
// ⚠️ CAMBIAR DESPUÉS DEL PRIMER LOGIN EN PRODUCCIÓN
// ══════════════════════════════════════════════════════════════
const SUPERADMIN = {
  nombre:   'Super Admin',
  email:    'admin@kenya.com',
  password: 'Kenya2024!',       // ← CAMBIAR DESPUÉS DEL PRIMER LOGIN
  empresa:  'Kenya Technology',
  telefono: '',
};

const run = async (client) => {
  console.log('📌 [01] Verificando superadmin...');

  // Verificar si ya existe
  const existe = await client.query(
    'SELECT id, email, rol FROM users WHERE email = $1',
    [SUPERADMIN.email]
  );

  if (existe.rows.length > 0) {
    const user = existe.rows[0];
    // Siempre actualizar el hash — la migración SQL inserta un hash placeholder
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hash   = await bcrypt.hash(SUPERADMIN.password, rounds);

    if (user.rol !== 'superadmin') {
      await client.query(
        "UPDATE users SET rol = 'superadmin', password_hash = $1 WHERE id = $2",
        [hash, user.id]
      );
      console.log(`   ⚠️  Usuario ${SUPERADMIN.email} promovido a superadmin y contraseña actualizada`);
    } else {
      await client.query(
        'UPDATE users SET password_hash = $1, aprobado_at = COALESCE(aprobado_at, NOW()) WHERE id = $2',
        [hash, user.id]
      );
      console.log(`   ✅ Superadmin ya existe (id: ${user.id}) — contraseña/hash sincronizados`);
    }
    return;
  }

  // Crear superadmin
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
  const hash   = await bcrypt.hash(SUPERADMIN.password, rounds);

  const result = await client.query(
    `INSERT INTO users (nombre, email, password_hash, rol, empresa, telefono, aprobado_at)
     VALUES ($1, $2, $3, 'superadmin', $4, $5, NOW())
     RETURNING id, email, rol`,
    [SUPERADMIN.nombre, SUPERADMIN.email, hash, SUPERADMIN.empresa, SUPERADMIN.telefono]
  );

  console.log(`   ✅ Superadmin creado:`);
  console.log(`      ID:       ${result.rows[0].id}`);
  console.log(`      Email:    ${SUPERADMIN.email}`);
  console.log(`      Password: ${SUPERADMIN.password}  ← CAMBIAR DESPUÉS DEL PRIMER LOGIN`);
  console.log(`      Rol:      superadmin`);
};

module.exports = { run };
