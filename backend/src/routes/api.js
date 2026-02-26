const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const extractController = require('../controllers/extractController');
const searchController = require('../controllers/searchController');
const quoteController = require('../controllers/quoteController');

// ============================================
// EXTRACTION ROUTES (AI Vision)
// ============================================

// POST /api/extract - Subir imagen y extraer specs
router.post('/extract', upload.single('image'), extractController.extractFromImage);

// GET /api/requirements/:id - Obtener requerimiento
router.get('/requirements/:id', extractController.getRequirement);

// PUT /api/requirements/:id - Actualizar specs (edición manual)
router.put('/requirements/:id', extractController.updateRequirement);

// ============================================
// SEARCH ROUTES (PeruCompras Scraping)
// ============================================

// POST /api/search - Buscar productos por specs
router.post('/search', searchController.searchBySpecs);

// POST /api/search/refresh - Forzar re-scraping de una marca
router.post('/search/refresh', searchController.refreshCatalog);

// GET /api/products/:id - Detalle de producto
router.get('/products/:id', searchController.getProduct);

// GET /api/products/ficha/:fichaId - Detalle de ficha PeruCompras
router.get('/products/ficha/:fichaId', searchController.getFicha);

// ============================================
// QUOTE ROUTES (Cotizaciones)
// ============================================

// POST /api/quote - Crear cotización
router.post('/quote', quoteController.createQuote);

// GET /api/quotes - Listar cotizaciones
router.get('/quotes', quoteController.listQuotes);

// GET /api/quotes/:id - Obtener cotización
router.get('/quotes/:id', quoteController.getQuote);

// PUT /api/quotes/:id - Actualizar cotización
router.put('/quotes/:id', quoteController.updateQuote);

// DELETE /api/quotes/:id - Eliminar cotización (soft delete)
router.delete('/quotes/:id', quoteController.deleteQuote);

// GET /api/quotes/:id/pdf - Descargar PDF
router.get('/quotes/:id/pdf', quoteController.downloadPDF);

// POST /api/quotes/:id/regenerate-pdf - Regenerar PDF
router.post('/quotes/:id/regenerate-pdf', quoteController.regeneratePDF);

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

module.exports = router;
