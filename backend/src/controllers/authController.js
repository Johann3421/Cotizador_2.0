// src/controllers/authController.js
'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { emailNuevoRegistro } = require('../services/emailService');
const { crearNotificacion }  = require('../services/notificationService');

// POST /api/auth/register
const register = async (req, res) => {
  const { nombre, email, password, empresa, telefono, motivo_registro } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const existe = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Este email ya está registrado' });
    }

    const password_hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '10'));

    const result = await pool.query(
      `INSERT INTO users (nombre, email, password_hash, empresa, telefono, motivo_registro, rol)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, nombre, email, rol, created_at`,
      [nombre.trim(), email.toLowerCase().trim(), password_hash, empresa || null, telefono || null, motivo_registro || null]
    );

    const nuevoUsuario = result.rows[0];

    // Notificar a admins por email
    await emailNuevoRegistro({ nombre, email, empresa, telefono, motivo_registro });

    // Crear notificación en DB para todos los admins
    const admins = await pool.query("SELECT id FROM users WHERE rol IN ('admin','superadmin')");
    for (const admin of admins.rows) {
      await crearNotificacion(admin.id, 'nuevo_registro',
        '🔔 Nuevo usuario solicita acceso',
        `${nombre} (${email}) quiere acceder al cotizador`,
        { usuario_id: nuevoUsuario.id }
      );
    }

    res.status(201).json({
      message: 'Registro exitoso. Tu cuenta está pendiente de aprobación.',
      user: { id: nuevoUsuario.id, nombre, email, rol: 'pending' }
    });
  } catch (err) {
    console.error('[Auth] Error en registro:', err.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = result.rows[0];
    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    if (user.rol === 'pending') {
      return res.status(403).json({
        error: 'Tu cuenta está pendiente de aprobación',
        code: 'PENDING',
        user: { nombre: user.nombre, email: user.email }
      });
    }

    // Actualizar último acceso
    await pool.query('UPDATE users SET ultimo_acceso = NOW() WHERE id = $1', [user.id]);

    // Generar JWT con JTI único
    const jti = uuidv4();
    const token = jwt.sign(
      { userId: user.id, email: user.email, rol: user.rol, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    console.error('[Auth] Error en login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.jti) {
        await pool.query(
          'INSERT INTO token_blacklist (token_jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT DO NOTHING',
          [decoded.jti, decoded.exp]
        );
      }
    }
    res.json({ message: 'Sesión cerrada' });
  } catch (_) {
    res.json({ message: 'Sesión cerrada' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, logout, me };
