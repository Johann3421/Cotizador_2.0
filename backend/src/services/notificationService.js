// src/services/notificationService.js
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const crearNotificacion = async (userId, tipo, titulo, mensaje, data = {}) => {
  await pool.query(
    'INSERT INTO notifications (user_id, tipo, titulo, mensaje, data) VALUES ($1,$2,$3,$4,$5)',
    [userId, tipo, titulo, mensaje, JSON.stringify(data)]
  ).catch(e => console.error('[Notif] Error:', e.message));
};

const getNotificaciones = async (userId, soloNoLeidas = false) => {
  const result = await pool.query(
    `SELECT * FROM notifications WHERE user_id=$1 ${soloNoLeidas ? 'AND leida=false' : ''}
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return result.rows;
};

const marcarLeidas = async (userId) => {
  await pool.query('UPDATE notifications SET leida=true WHERE user_id=$1 AND leida=false', [userId]);
};

const contarNoLeidas = async (userId) => {
  const result = await pool.query(
    'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND leida=false',
    [userId]
  );
  return parseInt(result.rows[0].count);
};

module.exports = { crearNotificacion, getNotificaciones, marcarLeidas, contarNoLeidas };
