// src/controllers/adminController.js
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { emailAprobacion, emailRechazo, emailCotizacionEnviada } = require('../services/emailService');
const { crearNotificacion } = require('../services/notificationService');

// GET /api/admin/users
const listarUsuarios = async (req, res) => {
  try {
    const { estado, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [parseInt(limit), offset];
    let whereClause = '';

    // soportar filtros de la UI: 'pendientes', 'activos', 'rechazados'
    if (estado) {
      if (estado === 'pendientes') {
        whereClause = "WHERE u.rol = $3";
        params.push('pending');
      } else if (estado === 'activos') {
        // activos = no pendientes y no rechazados
        whereClause = "WHERE u.rol != 'pending' AND u.rechazado_at IS NULL";
      } else if (estado === 'rechazados') {
        whereClause = 'WHERE u.rechazado_at IS NOT NULL';
      } else {
        // permitir pasar directamente 'user', 'admin', 'superadmin', 'pending'
        whereClause = 'WHERE u.rol = $3';
        params.push(estado);
      }
    }

    const result = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.empresa, u.telefono,
              u.motivo_registro, u.created_at, u.ultimo_acceso, u.aprobado_at,
              u.rechazado_at, u.motivo_rechazo,
              a.nombre as aprobado_por_nombre
       FROM users u
       LEFT JOIN users a ON u.aprobado_por = a.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    let countQuery = 'SELECT COUNT(*) FROM users';
    let countParams = [];
    if (estado) {
      if (estado === 'pendientes') {
        countQuery += " WHERE rol = $1";
        countParams.push('pending');
      } else if (estado === 'activos') {
        countQuery += " WHERE rol != 'pending' AND rechazado_at IS NULL";
      } else if (estado === 'rechazados') {
        countQuery += ' WHERE rechazado_at IS NOT NULL';
      } else {
        countQuery += ' WHERE rol = $1';
        countParams.push(estado);
      }
    }
    const total = await pool.query(countQuery, countParams);

    res.json({
      users: result.rows,
      total: parseInt(total.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/admin/users/:id/approve
const aprobarUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET rol='user', aprobado_por=$1, aprobado_at=NOW()
       WHERE id=$2 AND rol='pending'
       RETURNING *`,
      [req.user.id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado o ya procesado' });
    }
    const usuario = result.rows[0];

    await emailAprobacion(usuario);
    await crearNotificacion(parseInt(id), 'aprobacion',
      '✅ Tu cuenta fue aprobada',
      'Ya puedes ingresar al cotizador de Kenya',
      {}
    );

    res.json({ message: 'Usuario aprobado', user: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/admin/users/:id/reject
const rechazarUsuario = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET rechazado_at=NOW(), motivo_rechazo=$1
       WHERE id=$2 RETURNING *`,
      [motivo || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    const usuario = result.rows[0];
    await emailRechazo(usuario, motivo);
    await crearNotificacion(parseInt(id), 'rechazo',
      'Solicitud de acceso',
      motivo || 'Tu solicitud no fue aprobada en esta ocasión',
      {}
    );

    res.json({ message: 'Usuario rechazado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/admin/users/:id/role
const cambiarRol = async (req, res) => {
  if (req.user.rol !== 'superadmin') {
    return res.status(403).json({ error: 'Solo el superadmin puede cambiar roles' });
  }
  const { id } = req.params;
  const { rol } = req.body;
  if (!['user', 'admin', 'superadmin'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  try {
    const result = await pool.query(
      'UPDATE users SET rol=$1 WHERE id=$2 RETURNING id,nombre,email,rol',
      [rol, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/quote-requests
const listarSolicitudes = async (req, res) => {
  try {
    const { estado, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [parseInt(limit), offset];
    let whereClause = '';

    if (estado) {
      whereClause = 'WHERE qr.estado = $3';
      params.push(estado);
    }

    const result = await pool.query(
      `SELECT qr.*, u.nombre as usuario_nombre, u.email as usuario_email,
              a.nombre as atendido_por_nombre
       FROM quote_requests qr
       LEFT JOIN users u ON qr.user_id = u.id
       LEFT JOIN users a ON qr.atendido_por = a.id
       ${whereClause}
       ORDER BY qr.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    res.json({ solicitudes: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/quote-requests/:id
const getSolicitud = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT qr.*, u.nombre as usuario_nombre, u.email as usuario_email,
              a.nombre as atendido_por_nombre
       FROM quote_requests qr
       LEFT JOIN users u ON qr.user_id = u.id
       LEFT JOIN users a ON qr.atendido_por = a.id
       WHERE qr.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ solicitud: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/admin/quote-requests/:id/status
const cambiarEstadoSolicitud = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  if (!['pendiente', 'en_proceso', 'enviada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const result = await pool.query(
      `UPDATE quote_requests SET estado=$1, atendido_por=$2, atendido_at=NOW()
       WHERE id=$3 RETURNING *`,
      [estado, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json({ solicitud: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/admin/quote-requests/:id/send
const marcarEnviada = async (req, res) => {
  const { id } = req.params;
  const { pdf_url } = req.body;
  try {
    const result = await pool.query(
      `UPDATE quote_requests
       SET estado='enviada', atendido_por=$1, atendido_at=NOW(), pdf_url=$2
       WHERE id=$3 RETURNING *`,
      [req.user.id, pdf_url || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Solicitud no encontrada' });

    const solicitud = result.rows[0];
    await emailCotizacionEnviada(solicitud, pdf_url);

    // Notificar al usuario
    if (solicitud.user_id) {
      await crearNotificacion(solicitud.user_id, 'cotizacion_enviada',
        '📄 Tu cotización fue enviada',
        `La cotización que solicitaste ha sido procesada y enviada a ${solicitud.email_contacto}`,
        { solicitud_id: solicitud.id }
      );
    }

    res.json({ message: 'Cotización enviada', solicitud });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/stats
const getStats = async (req, res) => {
  try {
    const [usuarios, pendientes, solicitudes, solicitudesPend, fichas] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE rol != 'pending'"),
      pool.query("SELECT COUNT(*) FROM users WHERE rol = 'pending'"),
      pool.query('SELECT COUNT(*) FROM quote_requests'),
      pool.query("SELECT COUNT(*) FROM quote_requests WHERE estado = 'pendiente'"),
      pool.query('SELECT COUNT(*) FROM products'),
    ]);

    res.json({
      total_usuarios:         parseInt(usuarios.rows[0].count),
      usuarios_pendientes:    parseInt(pendientes.rows[0].count),
      total_solicitudes:      parseInt(solicitudes.rows[0].count),
      solicitudes_pendientes: parseInt(solicitudesPend.rows[0].count),
      total_fichas_catalogo:  parseInt(fichas.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listarUsuarios,
  aprobarUsuario,
  rechazarUsuario,
  cambiarRol,
  listarSolicitudes,
  getSolicitud,
  cambiarEstadoSolicitud,
  marcarEnviada,
  getStats,
};
