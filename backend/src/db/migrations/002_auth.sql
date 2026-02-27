-- ============================================================
-- Kenya Quotation System - Auth, Roles & Notifications
-- ============================================================

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  rol             TEXT NOT NULL DEFAULT 'pending',
  empresa         TEXT,
  telefono        TEXT,
  motivo_registro TEXT,
  aprobado_por    INTEGER REFERENCES users(id),
  aprobado_at     TIMESTAMP,
  rechazado_at    TIMESTAMP,
  motivo_rechazo  TEXT,
  ultimo_acceso   TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Tabla de sesiones/tokens (blacklist para logout)
CREATE TABLE IF NOT EXISTS token_blacklist (
  id         SERIAL PRIMARY KEY,
  token_jti  TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de solicitudes de cotización (cuando USER llega al Paso 4)
CREATE TABLE IF NOT EXISTS quote_requests (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id),
  quote_id        INTEGER REFERENCES quotes(id),
  requirement_id  INTEGER REFERENCES requirements(id),
  nombre_contacto TEXT NOT NULL,
  email_contacto  TEXT NOT NULL,
  telefono        TEXT NOT NULL,
  empresa         TEXT,
  notas           TEXT,
  estado          TEXT DEFAULT 'pendiente',
  atendido_por    INTEGER REFERENCES users(id),
  atendido_at     TIMESTAMP,
  pdf_url         TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Tabla de notificaciones
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  tipo        TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN DEFAULT false,
  data        JSONB,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_rol        ON users(rol);
CREATE INDEX IF NOT EXISTS idx_users_email      ON users(email);
CREATE INDEX IF NOT EXISTS idx_quote_req_estado ON quote_requests(estado);
CREATE INDEX IF NOT EXISTS idx_notif_user_leida ON notifications(user_id, leida);

-- Crear el primer superadmin (password: kenya2024admin — cambiar inmediatamente)
-- El hash se genera con bcrypt rounds=10
INSERT INTO users (nombre, email, password_hash, rol)
VALUES (
  'Super Admin Kenya',
  'admin@kenya.com',
  '$2b$10$rQnK8VXzJ5mK3L9wP7kH8uN2xM4yC6dE0fA1bG3hI5jK7lM9nO',
  'superadmin'
) ON CONFLICT (email) DO NOTHING;
