-- Migration 003: catalog_sync_log table + performance indexes
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards)

ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_url  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS categoria TEXT;

CREATE INDEX IF NOT EXISTS idx_products_marca_cat
  ON products(LOWER(marca), LOWER(categoria));

CREATE INDEX IF NOT EXISTS idx_products_ficha_id
  ON products(ficha_id);

CREATE TABLE IF NOT EXISTS catalog_sync_log (
  id           SERIAL PRIMARY KEY,
  sync_date    TIMESTAMP DEFAULT NOW(),
  total_fichas INTEGER,
  nuevas       INTEGER,
  actualizadas INTEGER,
  errores      INTEGER,
  duracion_seg INTEGER,
  detalle      JSONB
);
