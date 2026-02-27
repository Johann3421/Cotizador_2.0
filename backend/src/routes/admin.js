// src/routes/admin.js
'use strict';

const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const requireRole        = require('../middleware/requireRole');
const admin              = require('../controllers/adminController');
const notif              = require('../services/notificationService');

// ── Todas las rutas requieren auth + admin+ ──
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
