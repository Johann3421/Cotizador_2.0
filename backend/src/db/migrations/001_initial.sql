-- ============================================================
-- Kenya Quotation System - Migración Inicial
-- ============================================================

-- Requerimientos extraídos de imágenes
CREATE TABLE IF NOT EXISTS requirements (
  id SERIAL PRIMARY KEY,
  image_path TEXT,
  raw_text TEXT,
  extracted_specs JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fichas técnicas de PeruCompras (caché local)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  ficha_id TEXT UNIQUE,
  marca TEXT,
  nombre TEXT,
  specs JSONB,
  precio_referencial DECIMAL(10,2),
  url_ficha TEXT,
  ultima_actualizacion TIMESTAMP DEFAULT NOW()
);

-- Cotizaciones generadas
CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  numero_cotizacion TEXT UNIQUE,
  cliente TEXT,
  ruc TEXT,
  requirement_id INTEGER REFERENCES requirements(id) ON DELETE SET NULL,
  items JSONB,
  subtotal DECIMAL(10,2),
  igv DECIMAL(10,2),
  total DECIMAL(10,2),
  estado TEXT DEFAULT 'borrador',
  notas TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_products_marca ON products(marca);
CREATE INDEX IF NOT EXISTS idx_products_ficha_id ON products(ficha_id);
CREATE INDEX IF NOT EXISTS idx_products_ultima_actualizacion ON products(ultima_actualizacion);
CREATE INDEX IF NOT EXISTS idx_quotes_numero ON quotes(numero_cotizacion);
CREATE INDEX IF NOT EXISTS idx_quotes_estado ON quotes(estado);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_deleted_at ON quotes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_requirements_created_at ON requirements(created_at);
