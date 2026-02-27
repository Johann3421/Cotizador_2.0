// backend/scripts/seeds/02_test_users.js
// Solo para desarrollo — simula usuarios en distintos estados
const bcrypt = require('bcrypt');

const USUARIOS_PRUEBA = [
  {
    nombre:          'Admin de Prueba',
    email:           'admin.prueba@kenya.com',
    password:        'Test1234!',
    rol:             'admin',
    empresa:         'Kenya Technology',
    telefono:        '999111222',
    motivo_registro: 'Administrador del sistema para pruebas',
  },
  {
    nombre:          'Usuario Aprobado',
    email:           'usuario@test.com',
    password:        'Test1234!',
    rol:             'user',
    empresa:         'Municipalidad de Lima',
    telefono:        '999333444',
    motivo_registro: 'Necesito cotizar equipos para mi oficina',
  },
  {
    nombre:          'Usuario Pendiente',
    email:           'pendiente@test.com',
    password:        'Test1234!',
    rol:             'pending',
    empresa:         'MINSA',
    telefono:        '999555666',
    motivo_registro: 'Quiero cotizar laptops para el área de TI',
  },
  {
    nombre:          'Otro Pendiente',
    email:           'pendiente2@test.com',
    password:        'Test1234!',
    rol:             'pending',
    empresa:         'SUNAT',
    telefono:        '999777888',
    motivo_registro: 'Necesito equipos para licitación pública',
  },
];

const run = async (client) => {
  console.log('📌 [02] Creando usuarios de prueba...');

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');

  // Obtener id del superadmin para el campo aprobado_por
  const superadmin   = await client.query("SELECT id FROM users WHERE rol = 'superadmin' LIMIT 1");
  const superadminId = superadmin.rows[0]?.id || null;

  for (const u of USUARIOS_PRUEBA) {
    const existe = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);

    const hash        = await bcrypt.hash(u.password, rounds);
    const aprobadoPor = ['user', 'admin'].includes(u.rol) ? superadminId : null;

    if (existe.rows.length > 0) {
      // Ya existe — actualizar hash y rol por si quedó mal de un run anterior
      await client.query(
        'UPDATE users SET password_hash = $1, rol = $2, aprobado_por = $3 WHERE email = $4',
        [hash, u.rol, aprobadoPor, u.email]
      );
      console.log(`   🔄 ${u.rol.padEnd(10)} ${u.email.padEnd(30)} hash actualizado`);
      continue;
    }

    // aprobado_at: literal NOW() for approved roles, NULL otherwise
    if (['user', 'admin'].includes(u.rol)) {
      await client.query(
        `INSERT INTO users (nombre, email, password_hash, rol, empresa, telefono, motivo_registro, aprobado_por, aprobado_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [u.nombre, u.email, hash, u.rol, u.empresa, u.telefono, u.motivo_registro, aprobadoPor]
      );
    } else {
      await client.query(
        `INSERT INTO users (nombre, email, password_hash, rol, empresa, telefono, motivo_registro)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [u.nombre, u.email, hash, u.rol, u.empresa, u.telefono, u.motivo_registro]
      );
    }

    console.log(`   ✅ ${u.rol.padEnd(10)} ${u.email.padEnd(30)} pass: ${u.password}`);
  }
};

module.exports = { run };
