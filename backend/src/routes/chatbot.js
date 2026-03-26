const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');

// ============================================
// CHATBOT CLIENT MANAGEMENT
// ============================================

// GET /api/chatbot/client/:phone — Obtener o crear cliente
router.get('/client/:phone', chatbotController.getOrCreateClient);

// PUT /api/chatbot/client/:phone — Actualizar datos del cliente
router.put('/client/:phone', chatbotController.updateClient);

// PUT /api/chatbot/client/:phone/estado — Actualizar estado del flujo
router.put('/client/:phone/estado', chatbotController.updateEstado);

// GET /api/chatbot/client/:phone/history — Historial del cliente
router.get('/client/:phone/history', chatbotController.getHistory);

// ============================================
// CHATBOT OPERATIONS
// ============================================

// POST /api/chatbot/confirm-quote — Confirmar cotización y generar factura
router.post('/confirm-quote', chatbotController.confirmQuote);

// POST /api/chatbot/log-interaction — Registrar interacción
router.post('/log-interaction', chatbotController.logInteraction);

// GET /api/chatbot/stats — Dashboard estadísticas
router.get('/stats', chatbotController.getStats);

module.exports = router;
