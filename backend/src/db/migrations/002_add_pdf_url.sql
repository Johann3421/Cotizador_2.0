-- ============================================================
-- Migración 002: Agregar columnas pdf_url y categoria a products
-- ============================================================

-- Columna dedicada para la URL del PDF de especificación técnica
ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Columna para el tipo de equipo ('desktop' | 'laptop' | 'all-in-one')
-- Permite queries de caché por marca+categoria sin parsear el JSONB
ALTER TABLE products ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Índice compuesto para las queries de caché del scraper
CREATE INDEX IF NOT EXISTS idx_products_marca_categoria
  ON products(marca, categoria);

-- Backfill: poblar pdf_url desde el campo pdfUrl del JSONB specs
UPDATE products
  SET pdf_url = specs->>'pdfUrl'
  WHERE pdf_url IS NULL
    AND specs IS NOT NULL
    AND specs->>'pdfUrl' IS NOT NULL
    AND specs->>'pdfUrl' <> '';

-- Backfill: poblar categoria desde el campo categoria del JSONB specs (si existe)
UPDATE products
  SET categoria = specs->>'categoria'
  WHERE categoria IS NULL
    AND specs IS NOT NULL
    AND specs->>'categoria' IS NOT NULL
    AND specs->>'categoria' <> '';
