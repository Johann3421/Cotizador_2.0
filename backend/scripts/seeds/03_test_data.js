// backend/scripts/seeds/03_test_data.js
// Crea solicitudes de cotización de prueba

const run = async (client) => {
  console.log('📌 [03] Creando datos de prueba (solicitudes)...');

  // Obtener usuario de prueba aprobado
  const usuario = await client.query(
    "SELECT id FROM users WHERE email = 'usuario@test.com' LIMIT 1"
  );
  if (usuario.rows.length === 0) {
    console.log('   ⏭️  Usuario de prueba no encontrado — omitiendo solicitudes');
    return;
  }
  const userId = usuario.rows[0].id;

  // Verificar si ya hay solicitudes
  const existentes = await client.query(
    'SELECT COUNT(*) FROM quote_requests WHERE user_id = $1', [userId]
  );
  if (parseInt(existentes.rows[0].count) > 0) {
    console.log('   ⏭️  Solicitudes de prueba ya existen — omitiendo');
    return;
  }

  const SOLICITUDES = [
    {
      nombre_contacto: 'Carlos Ramírez',
      email_contacto:  'carlos.ramirez@muni.gob.pe',
      telefono:        '987654321',
      empresa:         'Municipalidad de Lima',
      notas:           '3 computadoras de escritorio para área de logística',
      estado:          'pendiente',
    },
    {
      nombre_contacto: 'María Torres',
      email_contacto:  'maria.torres@minsa.gob.pe',
      telefono:        '976543210',
      empresa:         'MINSA',
      notas:           '5 laptops para trabajo remoto del personal de salud',
      estado:          'en_proceso',
    },
    {
      nombre_contacto: 'Jorge Quispe',
      email_contacto:  'jorge.quispe@sunat.gob.pe',
      telefono:        '965432109',
      empresa:         'SUNAT',
      notas:           '10 equipos all-in-one para ventanillas de atención',
      estado:          'enviada',
    },
  ];

  for (const s of SOLICITUDES) {
    await client.query(
      `INSERT INTO quote_requests (user_id, nombre_contacto, email_contacto, telefono, empresa, notas, estado, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - (random() * interval '7 days'))`,
      [userId, s.nombre_contacto, s.email_contacto, s.telefono, s.empresa, s.notas, s.estado]
    );
    console.log(`   ✅ Solicitud "${s.estado}" para ${s.empresa}`);
  }

  // Crear notificaciones de prueba para el superadmin
  const superadmin = await client.query(
    "SELECT id FROM users WHERE rol = 'superadmin' LIMIT 1"
  );
  if (superadmin.rows.length > 0) {
    const adminId = superadmin.rows[0].id;
    const NOTIFS = [
      { tipo: 'nuevo_registro',  titulo: '🔔 Nuevo usuario solicita acceso',  mensaje: 'pendiente@test.com quiere acceder al cotizador' },
      { tipo: 'nuevo_registro',  titulo: '🔔 Nuevo usuario solicita acceso',  mensaje: 'pendiente2@test.com quiere acceder al cotizador' },
      { tipo: 'nueva_solicitud', titulo: '🛒 Nueva solicitud de Carlos Ramírez', mensaje: 'Municipalidad de Lima — 3 computadoras de escritorio' },
    ];
    for (const n of NOTIFS) {
      await client.query(
        'INSERT INTO notifications (user_id, tipo, titulo, mensaje, leida) VALUES ($1,$2,$3,$4,false)',
        [adminId, n.tipo, n.titulo, n.mensaje]
      );
    }
    console.log(`   ✅ 3 notificaciones de prueba para superadmin`);
  }
};

module.exports = { run };
