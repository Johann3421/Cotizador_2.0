// src/middleware/auth.js
'use strict';

const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const verificarToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar blacklist
    const blacklisted = await pool.query(
      'SELECT id FROM token_blacklist WHERE token_jti = $1',
      [decoded.jti]
    );
    if (blacklisted.rows.length > 0) {
      return res.status(401).json({ error: 'Sesión inválida' });
    }

    // Verificar usuario activo
    const userResult = await pool.query(
      'SELECT id, nombre, email, rol FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];
    if (user.rol === 'pending') {
      return res.status(403).json({ error: 'Cuenta pendiente de aprobación', code: 'PENDING' });
    }

    req.user     = user;
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada', code: 'EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Middleware opcional — no falla si no hay token, solo adjunta user si existe
const verificarTokenOpcional = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return next();

    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userResult = await pool.query(
      'SELECT id, nombre, email, rol FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (userResult.rows.length > 0) {
      req.user = userResult.rows[0];
    }
  } catch (_) {
    // Token inválido — seguir sin user
  }
  next();
};

module.exports = { verificarToken, verificarTokenOpcional };
