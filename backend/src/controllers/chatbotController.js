const ChatbotClient = require('../models/ChatbotClient');
const Quote = require('../models/Quote');
const { generateQuotePDF } = require('../services/quoteService');

/**
 * GET /api/chatbot/client/:phone
 * Obtiene o crea un cliente por teléfono (upsert)
 */
async function getOrCreateClient(req, res) {
  try {
    const { phone } = req.params;
    const { nombre, conversation_id } = req.query;

    if (!phone) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    const { client, isNew } = await ChatbotClient.findOrCreate(phone, {
      nombre,
      conversation_id: conversation_id ? parseInt(conversation_id) : null,
    });

    res.json({ success: true, client, isNew });
  } catch (error) {
    console.error('[Chatbot] Error getOrCreateClient:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/chatbot/client/:phone
 * Actualiza datos del cliente
 */
async function updateClient(req, res) {
  try {
    const { phone } = req.params;
    const data = req.body;

    const client = await ChatbotClient.update(phone, data);
    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({ success: true, client });
  } catch (error) {
    console.error('[Chatbot] Error updateClient:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/chatbot/client/:phone/estado
 * Actualiza solo el estado del flujo
 */
async function updateEstado(req, res) {
  try {
    const { phone } = req.params;
    const { estado, datos } = req.body;

    if (!estado) {
      return res.status(400).json({ error: 'Se requiere el campo "estado"' });
    }

    const client = await ChatbotClient.updateEstado(phone, estado, datos || {});
    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({ success: true, client });
  } catch (error) {
    console.error('[Chatbot] Error updateEstado:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/chatbot/client/:phone/history
 * Historial de cotizaciones del cliente
 */
async function getHistory(req, res) {
  try {
    const { phone } = req.params;
    const history = await ChatbotClient.getHistory(phone);

    if (!history.client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json({ success: true, ...history });
  } catch (error) {
    console.error('[Chatbot] Error getHistory:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/chatbot/confirm-quote
 * Confirma una cotización y genera factura PDF desde el chatbot
 */
async function confirmQuote(req, res) {
  try {
    const { phone, cliente, ruc, empresa, items, notas, requirement_id } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Se requiere teléfono del cliente' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requieren items para la cotización' });
    }

    // Crear la cotización
    const quote = await Quote.create({
      cliente: cliente || empresa || 'Cliente WhatsApp',
      ruc: ruc || null,
      requirement_id: requirement_id || null,
      items,
      notas: notas || `Cotización generada automáticamente via chatbot. Tel: ${phone}`,
    });

    // Actualizar estado a confirmada
    await Quote.update(quote.id, { estado: 'confirmada' });

    // Generar PDF
    let pdfInfo = null;
    try {
      pdfInfo = await generateQuotePDF(quote.id);
    } catch (pdfErr) {
      console.error('[Chatbot] Error generando PDF:', pdfErr.message);
    }

    // Registrar en el cliente
    const chatClient = await ChatbotClient.findByPhone(phone);
    if (chatClient) {
      await ChatbotClient.incrementCotizaciones(phone, quote.id);
      await ChatbotClient.updateEstado(phone, 'cotizacion_confirmada', {
        ultima_cotizacion: quote.numero_cotizacion,
        fecha_confirmacion: new Date().toISOString(),
      });
      await ChatbotClient.logInteraction(chatClient.id, {
        tipo: 'confirmacion',
        mensajeUsuario: 'Confirmación de cotización',
        respuestaBot: `Cotización ${quote.numero_cotizacion} confirmada`,
        estadoFlujo: 'cotizacion_confirmada',
        metadata: { quote_id: quote.id, total: quote.total },
      });
    }

    console.log(`[Chatbot] Cotización confirmada: ${quote.numero_cotizacion} — Cliente: ${phone}`);

    res.status(201).json({
      success: true,
      quote_id: quote.id,
      numero_cotizacion: quote.numero_cotizacion,
      total: quote.total,
      subtotal: quote.subtotal,
      igv: quote.igv,
      pdf_url: pdfInfo?.url || null,
      quote,
    });
  } catch (error) {
    console.error('[Chatbot] Error confirmQuote:', error.message);
    res.status(500).json({ error: 'Error al confirmar cotización', details: error.message });
  }
}

/**
 * POST /api/chatbot/log-interaction
 * Registra una interacción del chatbot (para analytics)
 */
async function logInteraction(req, res) {
  try {
    const { phone, conversation_id, tipo, mensaje_usuario, respuesta_bot, estado_flujo, metadata } = req.body;

    const client = await ChatbotClient.findByPhone(phone);
    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const interaction = await ChatbotClient.logInteraction(client.id, {
      conversationId: conversation_id,
      tipo,
      mensajeUsuario: mensaje_usuario,
      respuestaBot: respuesta_bot,
      estadoFlujo: estado_flujo,
      metadata: metadata || {},
    });

    res.status(201).json({ success: true, interaction });
  } catch (error) {
    console.error('[Chatbot] Error logInteraction:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/chatbot/stats
 * Dashboard de estadísticas del chatbot
 */
async function getStats(req, res) {
  try {
    const stats = await ChatbotClient.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[Chatbot] Error getStats:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getOrCreateClient,
  updateClient,
  updateEstado,
  getHistory,
  confirmQuote,
  logInteraction,
  getStats,
};
