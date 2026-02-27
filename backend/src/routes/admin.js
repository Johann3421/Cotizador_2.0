// src/routes/admin.js
'use strict';

const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const requireRole        = require('../middleware/requireRole');
const admin              = require('../controllers/adminController');
const notif              = require('../services/notificationService');
const { pool }           = require('../db/connection');
const bcrypt             = require('bcrypt');

// ============================================
// ENDPOINT DE RESCATE (sin auth)
// ============================================
// Solo disponible en producción si hay emergencia
// Permite reparar superadmin sin estar logueado
router.post('/init-superadmin', async (req, res) => {
  try {
    const { secret } = req.body;
    const correctSecret = process.env.ADMIN_INIT_SECRET || 'EMPTY_DO_NOT_USE';
    
    // Verificación de seguridad
    if (!secret || secret !== correctSecret) {
      // No revelar si existe o no
      return res.status(403).json({ error: 'No autorizado' });
    }

    // Crear/reparar superadmin
    const email = 'admin@kenya.com';
    const password = 'Kenya2024!';
    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10');
    const correctHash = await bcrypt.hash(password, rounds);

    // Si existe, actualizar
    const existe = await pool.query("SELECT id, rol FROM users WHERE email = $1", [email]);
    if (existe.rows.length > 0) {
      await pool.query(
        "UPDATE users SET rol = 'superadmin', password_hash = $1 WHERE id = $2",
        [correctHash, existe.rows[0].id]
      );
      console.log('[AdminInit] ✅ Superadmin reparado');
      return res.json({ 
        ok: true, 
        message: 'Superadmin actualizado',
        email,
        password: 'Kenya2024!'
      });
    }

    // Si no existe, crear
    await pool.query(
      `INSERT INTO users (nombre, email, password_hash, rol, empresa, aprobado_at) 
       VALUES ($1, $2, $3, 'superadmin', 'Kenya Technology', NOW())`,
      ['Super Admin', email, correctHash]
    );
    console.log('[AdminInit] ✅ Superadmin creado');
    res.json({ 
      ok: true, 
      message: 'Superadmin creado',
      email,
      password: 'Kenya2024!'
    });
  } catch (err) {
    console.error('[AdminInit] Error:', err.message);
    res.status(500).json({ error: 'Error al crear/reparar superadmin' });
  }
});

// ============================================
// RUTAS PROTEGIDAS (requieren auth)
// ============================================
// Todas las rutas siguientes requieren auth + admin+
router.use(verificarToken, requireRole('admin+'));

// Dashboard
router.get('/stats', admin.getStats);

// Usuarios
router.get('/users',              admin.listarUsuarios);
router.patch('/users/:id/approve', admin.aprobarUsuario);
router.patch('/users/:id/reject',  admin.rechazarUsuario);
router.patch('/users/:id/role',    admin.cambiarRol);

// Solicitudes de cotización
router.get('/quote-requests',          admin.listarSolicitudes);
router.get('/quote-requests/:id',      admin.getSolicitud);
router.patch('/quote-requests/:id/status', admin.cambiarEstadoSolicitud);
router.patch('/quote-requests/:id/sent',   admin.marcarEnviada);

// Notificaciones (del admin autenticado)
router.get('/notifications', async (req, res) => {
  try {
    const rows = await notif.getNotificaciones(req.user.id, req.query.unread === 'true');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/count', async (req, res) => {
  try {
    const count = await notif.contarNoLeidas(req.user.id);
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/read', async (req, res) => {
  try {
    await notif.marcarLeidas(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
