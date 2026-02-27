// backend/scripts/seeds/01_superadmin.js
const bcrypt = require('bcrypt');

// ══════════════════════════════════════════════════════════════
// CREDENCIALES DEL SUPERADMIN INICIAL
// ⚠️ CAMBIAR DESPUÉS DEL PRIMER LOGIN EN PRODUCCIÓN
// ══════════════════════════════════════════════════════════════
const SUPERADMIN = {
  nombre:   'Super Admin',
  email:    'admin@kenya.com',
  password: 'Kenya2024!',
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
    if (user.rol !== 'superadmin') {
      // Existe pero no es superadmin → promoverlo
      await client.query(
        "UPDATE users SET rol = 'superadmin' WHERE id = $1",
        [user.id]
      );
      console.log(`   ⚠️  Usuario ${SUPERADMIN.email} promovido a superadmin`);
    } else {
      console.log(`   ✅ Superadmin ya existe (id: ${user.id}) — sin cambios`);
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
