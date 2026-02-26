const Quote = require('../models/Quote');
const { generateQuotePDF, getPDFPath } = require('../services/quoteService');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/quote
 * Crea una nueva cotización
 */
async function createQuote(req, res) {
  try {
    const { cliente, ruc, requirement_id, items, notas } = req.body;

    if (!cliente) {
      return res.status(400).json({ error: 'El campo "cliente" es requerido' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un item en la cotización' });
    }

    const quote = await Quote.create({ cliente, ruc, requirement_id, items, notas });

    console.log(`[Quote] Cotización creada: ${quote.numero_cotizacion}`);

    // Generar PDF automáticamente
    let pdfInfo = null;
    try {
      pdfInfo = await generateQuotePDF(quote.id);
    } catch (pdfError) {
      console.error('[Quote] Error generando PDF (no crítico):', pdfError.message);
    }

    res.status(201).json({
      success: true,
      quote_id: quote.id,
      numero_cotizacion: quote.numero_cotizacion,
      total: quote.total,
      pdf_url: pdfInfo?.url || null,
      quote,
    });
  } catch (error) {
    console.error('[Quote] Error:', error.message);
    res.status(500).json({ error: 'Error al crear la cotización', details: error.message });
  }
}

/**
 * GET /api/quotes
 * Lista cotizaciones con paginación y búsqueda
 */
async function listQuotes(req, res) {
  try {
    const { page = 1, limit = 20, estado, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await Quote.findAll({
      limit: parseInt(limit),
      offset,
      estado,
      search,
    });

    res.json({
      success: true,
      ...result,
      page: parseInt(page),
      total_pages: Math.ceil(result.total / parseInt(limit)),
    });
  } catch (error) {
    console.error('[Quote] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/quotes/:id
 * Obtiene una cotización completa
 */
async function getQuote(req, res) {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }
    res.json(quote);
  } catch (error) {
    console.error('[Quote] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/quotes/:id
 * Actualiza una cotización
 */
async function updateQuote(req, res) {
  try {
    const { cliente, ruc, items, notas, estado } = req.body;
    const updated = await Quote.update(req.params.id, { cliente, ruc, items, notas, estado });
    
    if (!updated) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    res.json({ success: true, quote: updated });
  } catch (error) {
    console.error('[Quote] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/quotes/:id
 * Soft delete de cotización
 */
async function deleteQuote(req, res) {
  try {
    const deleted = await Quote.softDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    res.json({ success: true, message: `Cotización ${deleted.numero_cotizacion} eliminada` });
  } catch (error) {
    console.error('[Quote] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/quotes/:id/pdf
 * Descarga el PDF de una cotización
 */
async function downloadPDF(req, res) {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ error: 'Cotización no encontrada' });
    }

    const pdfPath = getPDFPath(quote.numero_cotizacion);

    // Si el PDF no existe, generarlo
    if (!fs.existsSync(pdfPath)) {
      await generateQuotePDF(quote.id);
    }

    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'No se pudo generar el PDF' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.numero_cotizacion}.pdf"`);
    
    const readStream = fs.createReadStream(pdfPath);
    readStream.pipe(res);
  } catch (error) {
    console.error('[Quote] Error PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/quotes/:id/regenerate-pdf
 * Regenera el PDF de una cotización
 */
async function regeneratePDF(req, res) {
  try {
    const pdfInfo = await generateQuotePDF(req.params.id);
    res.json({ success: true, pdf_url: pdfInfo.url });
  } catch (error) {
    console.error('[Quote] Error regenerando PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createQuote,
  listQuotes,
  getQuote,
  updateQuote,
  deleteQuote,
  downloadPDF,
  regeneratePDF,
};
