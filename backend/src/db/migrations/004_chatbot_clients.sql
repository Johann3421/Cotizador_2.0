-- ============================================================
-- Kenya Quotation System - Chatbot Clients & Sessions
-- Migration 004: Soporte para vendedor autónomo via WhatsApp
-- ============================================================

-- Clientes registrados por el chatbot
CREATE TABLE IF NOT EXISTS chatbot_clients (
  id                      SERIAL PRIMARY KEY,
  phone                   TEXT UNIQUE NOT NULL,
  nombre                  TEXT,
  email                   TEXT,
  ruc                     TEXT,
  empresa                 TEXT,
  tipo_persona            TEXT DEFAULT 'natural',   -- natural | juridica
  conversation_id         INTEGER,
  estado_flujo            TEXT DEFAULT 'nuevo',
  ultimo_requerimiento_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  ultima_cotizacion_id    INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  datos_pendientes        JSONB DEFAULT '{}',
  total_cotizaciones      INTEGER DEFAULT 0,
  total_compras           DECIMAL(12,2) DEFAULT 0,
  notas                   TEXT,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

-- Sesiones de conversación del chatbot
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER REFERENCES chatbot_clients(id) ON DELETE CASCADE,
  conversation_id  INTEGER NOT NULL,
  estado           TEXT DEFAULT 'activo',
  contexto         JSONB DEFAULT '{}',
  ultimo_mensaje_at TIMESTAMP DEFAULT NOW(),
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Historial de interacciones (para analytics)
CREATE TABLE IF NOT EXISTS chatbot_interactions (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER REFERENCES chatbot_clients(id) ON DELETE CASCADE,
  conversation_id INTEGER,
  tipo            TEXT NOT NULL,        -- saludo, imagen, texto, confirmacion, error, factura
  mensaje_usuario TEXT,
  respuesta_bot   TEXT,
  estado_flujo    TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_chatbot_clients_phone      ON chatbot_clients(phone);
CREATE INDEX IF NOT EXISTS idx_chatbot_clients_estado      ON chatbot_clients(estado_flujo);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_conv       ON chatbot_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_client     ON chatbot_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_client  ON chatbot_interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_tipo    ON chatbot_interactions(tipo);
CREATE INDEX IF NOT EXISTS idx_chatbot_interactions_created ON chatbot_interactions(created_at);
