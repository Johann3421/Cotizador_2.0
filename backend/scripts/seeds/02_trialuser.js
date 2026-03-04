const bcrypt = require('bcrypt');

const TRIAL_USER = {
    nombre: 'Usuario de Prueba',
    email: 'prueba@kenya.com',
    password: 'prueba', // Contraseña fácil para compartirse
    empresa: 'Trial',
    telefono: '',
};

const run = async (client) => {
    console.log('📌 [02] Verificando usuario de prueba...');

    // Crear tabla de IPs para el trial si no existe
    await client.query(`
    CREATE TABLE IF NOT EXISTS trial_ips (
      ip VARCHAR(45) PRIMARY KEY,
      used_at TIMESTAMP DEFAULT NOW()
    );
  `);

    const existe = await client.query(
        'SELECT id, email, rol FROM users WHERE email = $1',
        [TRIAL_USER.email]
    );

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const hash = await bcrypt.hash(TRIAL_USER.password, rounds);

    if (existe.rows.length > 0) {
        const user = existe.rows[0];
        await client.query(
            "UPDATE users SET rol = 'trial', password_hash = $1, aprobado_at = COALESCE(aprobado_at, NOW()) WHERE id = $2",
            [hash, user.id]
        );
        console.log(`   ✅ Usuario de prueba ya existe (id: ${user.id}) — actualizado`);
        return;
    }

    const result = await client.query(
        `INSERT INTO users (nombre, email, password_hash, rol, empresa, telefono, aprobado_at)
     VALUES ($1, $2, $3, 'trial', $4, $5, NOW())
     RETURNING id, email, rol`,
        [TRIAL_USER.nombre, TRIAL_USER.email, hash, TRIAL_USER.empresa, TRIAL_USER.telefono]
    );

    console.log(`   ✅ Usuario de prueba creado:`);
    console.log(`      ID:       ${result.rows[0].id}`);
    console.log(`      Email:    ${TRIAL_USER.email}`);
    console.log(`      Password: ${TRIAL_USER.password}`);
    console.log(`      Rol:      trial`);
};

module.exports = { run };
