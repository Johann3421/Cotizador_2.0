const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const extractController = require('../controllers/extractController');
const searchController = require('../controllers/searchController');
const quoteController = require('../controllers/quoteController');
const { ejecutarSyncManual, isSyncEnProgreso } = require('../jobs/syncCatalog');
const { verificarToken, verificarTokenOpcional } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// EXTRACTION ROUTES (AI Vision)
// ============================================

// POST /api/extract - Subir imagen y extraer specs
router.post('/extract', verificarTokenOpcional, upload.single('image'), extractController.extractFromImage);

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
// ADMIN — Sincronización del catálogo
// ============================================

// GET /api/admin/catalog-status — Estado del catálogo en DB
router.get('/admin/catalog-status', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        marca,
        categoria,
        COUNT(*) as total,
        MAX(ultima_actualizacion) as ultima_actualizacion
      FROM products
      GROUP BY marca, categoria
      ORDER BY marca, categoria
    `);
    const lastSync = await pool.query(
      'SELECT * FROM catalog_sync_log ORDER BY sync_date DESC LIMIT 1'
    ).catch(() => ({ rows: [] }));
    res.json({
      enProgreso: isSyncEnProgreso(),
      ultimoSync: lastSync.rows[0] || null,
      fichasPorMarca: stats.rows,
      totalFichas: stats.rows.reduce((sum, r) => sum + parseInt(r.total), 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/sync — Dispara sync manual en background
router.post('/admin/sync', async (req, res) => {
  if (isSyncEnProgreso()) {
    return res.status(409).json({ error: 'Sync ya en progreso' });
  }
  res.json({ message: 'Sync iniciado en background. Ver GET /api/admin/catalog-status para el progreso.' });
  ejecutarSyncManual((progreso) => {
    console.log('[Sync] Progreso:', JSON.stringify(progreso));
  }).catch(e => console.error('[Sync] Error:', e.message));
});

// ============================================
// QUOTE REQUESTS (solicitudes de usuario)
// ============================================

router.post('/quote-requests', verificarToken, async (req, res) => {
  try {
    const { quote_id, requirement_id, nombre_contacto, email_contacto, telefono, empresa, notas } = req.body;
    const result = await pool.query(
      `INSERT INTO quote_requests
         (user_id, quote_id, requirement_id, nombre_contacto, email_contacto, telefono, empresa, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, quote_id || null, requirement_id || null, nombre_contacto, email_contacto, telefono, empresa, notas]
    );
    // Notificar admins
    const admins = await pool.query("SELECT id FROM users WHERE rol IN ('admin','superadmin')");
    const notifService = require('../services/notificationService');
    for (const admin of admins.rows) {
      await notifService.crearNotificacion(
        admin.id,
        'nueva_solicitud',
        'Nueva solicitud de cotización',
        `${nombre_contacto} (${empresa}) solicita cotización`,
        { solicitud_id: result.rows[0].id }
      );
    }
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

module.exports = router;
