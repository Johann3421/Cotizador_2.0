// src/middleware/requireRole.js
'use strict';

const JERARQUIA = { pending: 0, user: 1, admin: 2, superadmin: 3 };

const requireRole = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });

    const rolUsuario = JERARQUIA[req.user.rol] || 0;
    const tienePermiso = rolesPermitidos.some(rol => {
      if (rol === 'admin+') return rolUsuario >= JERARQUIA.admin;
      return req.user.rol === rol;
    });

    if (!tienePermiso) {
      return res.status(403).json({ error: 'Sin permisos para esta acción' });
    }
    next();
  };
};

module.exports = requireRole;
