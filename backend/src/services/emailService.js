// src/services/emailService.js
'use strict';

const nodemailer = require('nodemailer');

const crearTransporter = () => {
  if (process.env.EMAIL_PROVIDER === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Fallback: no enviar emails si no hay config
  return null;
};

const transporter = crearTransporter();

const enviar = async (opts) => {
  if (!transporter) {
    console.warn('[Email] Sin configuración de email — salteado');
    return;
  }
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM || 'Kenya Cotizador <noreply@kenya.com>', ...opts });
  } catch (e) {
    console.error('[Email] Error:', e.message);
  }
};

// ── Templates ─────────────────────────────────────────────────

const emailNuevoRegistro = async (usuario) => {
  const adminEmail = process.env.EMAIL_ADMIN;
  if (!adminEmail) return;
  await enviar({
    to: adminEmail,
    subject: '🔔 Kenya Cotizador — Nuevo usuario solicita acceso',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">🔔 Nueva solicitud de acceso</h2>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e9ecef">
          <p style="color:#333">Un nuevo usuario se registró y espera aprobación:</p>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666;width:140px">Nombre</td><td style="padding:8px;font-weight:bold">${usuario.nombre}</td></tr>
            <tr style="background:#fff"><td style="padding:8px;color:#666">Email</td><td style="padding:8px;font-weight:bold">${usuario.email}</td></tr>
            <tr><td style="padding:8px;color:#666">Empresa</td><td style="padding:8px">${usuario.empresa || '—'}</td></tr>
            <tr style="background:#fff"><td style="padding:8px;color:#666">Teléfono</td><td style="padding:8px">${usuario.telefono || '—'}</td></tr>
            <tr><td style="padding:8px;color:#666">Motivo</td><td style="padding:8px">${usuario.motivo_registro || '—'}</td></tr>
          </table>
          <div style="margin-top:20px;text-align:center">
            <a href="${process.env.FRONTEND_URL || ''}/admin/users"
               style="background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
              Ver en Panel Admin →
            </a>
          </div>
        </div>
      </div>`,
  });
};

const emailAprobacion = async (usuario) => {
  await enviar({
    to: usuario.email,
    subject: '✅ Kenya Cotizador — Tu cuenta fue aprobada',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">✅ ¡Bienvenido a Kenya Cotizador!</h2>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e9ecef">
          <p>Hola <strong>${usuario.nombre}</strong>,</p>
          <p>Tu cuenta ha sido aprobada. Ya puedes ingresar al sistema de cotización.</p>
          <div style="margin-top:20px;text-align:center">
            <a href="${process.env.FRONTEND_URL || ''}/login"
               style="background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
              Ingresar al Cotizador →
            </a>
          </div>
        </div>
      </div>`,
  });
};

const emailRechazo = async (usuario, motivo) => {
  await enviar({
    to: usuario.email,
    subject: 'Kenya Cotizador — Solicitud de acceso',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">Respuesta a tu solicitud</h2>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e9ecef">
          <p>Hola <strong>${usuario.nombre}</strong>,</p>
          <p>En esta ocasión no podemos aprobar tu acceso al sistema.</p>
          ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
          <p>Si tienes preguntas, contáctanos en <a href="mailto:${process.env.EMAIL_ADMIN || ''}">${process.env.EMAIL_ADMIN || ''}</a>.</p>
        </div>
      </div>`,
  });
};

const emailNuevaSolicitudCotizacion = async (solicitud, usuario) => {
  const adminEmail = process.env.EMAIL_ADMIN;
  if (!adminEmail) return;
  await enviar({
    to: adminEmail,
    subject: `🛒 Kenya Cotizador — Nueva solicitud de cotización #${solicitud.id}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">🛒 Nueva solicitud de cotización</h2>
          <p style="color:#aaa;margin:8px 0 0">Solicitud #${solicitud.id}</p>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e9ecef">
          <h3 style="color:#333;margin-top:0">Datos del solicitante</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#666;width:140px">Nombre</td><td style="padding:8px;font-weight:bold">${solicitud.nombre_contacto}</td></tr>
            <tr style="background:#fff"><td style="padding:8px;color:#666">Email</td><td style="padding:8px">${solicitud.email_contacto}</td></tr>
            <tr><td style="padding:8px;color:#666">Teléfono</td><td style="padding:8px">${solicitud.telefono}</td></tr>
            <tr style="background:#fff"><td style="padding:8px;color:#666">Empresa</td><td style="padding:8px">${solicitud.empresa || '—'}</td></tr>
            <tr><td style="padding:8px;color:#666">Notas</td><td style="padding:8px">${solicitud.notas || '—'}</td></tr>
          </table>
          <div style="margin-top:20px;text-align:center">
            <a href="${process.env.FRONTEND_URL || ''}/admin/quote-requests"
               style="background:#e63946;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
              Ver Solicitud y Enviar Cotización →
            </a>
          </div>
        </div>
      </div>`,
  });
};

const emailCotizacionEnviada = async (solicitud, pdfUrl) => {
  await enviar({
    to: solicitud.email_contacto,
    subject: 'Kenya Technology — Tu cotización está lista',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a2e;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">Tu cotización está lista</h2>
        </div>
        <div style="background:#f8f9fa;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e9ecef">
          <p>Hola <strong>${solicitud.nombre_contacto}</strong>,</p>
          <p>Tu cotización ha sido preparada por nuestro equipo.</p>
          <p>Para cualquier consulta comunícate con nosotros en <a href="mailto:${process.env.EMAIL_ADMIN || ''}">${process.env.EMAIL_ADMIN || ''}</a>.</p>
          ${pdfUrl ? `
          <div style="margin-top:20px;text-align:center">
            <a href="${pdfUrl}" style="background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
              Descargar Cotización PDF →
            </a>
          </div>` : ''}
        </div>
      </div>`,
  });
};

module.exports = {
  emailNuevoRegistro,
  emailAprobacion,
  emailRechazo,
  emailNuevaSolicitudCotizacion,
  emailCotizacionEnviada,
};
