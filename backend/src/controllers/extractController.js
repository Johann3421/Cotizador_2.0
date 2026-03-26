const { extractSpecsFromImage, extractSpecsFromUrl } = require('../services/aiService');
const axios = require('axios');
const Requirement = require('../models/Requirement');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * POST /api/extract
 * Recibe una imagen y extrae los requerimientos técnicos usando AI Vision
 */
async function extractFromImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen. Envía un archivo en el campo "image".' });
    }

    if (req.user && req.user.rol === 'trial') {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
      const ipCheck = await pool.query('SELECT * FROM trial_ips WHERE ip = $1', [clientIp]);
      if (ipCheck.rows.length > 0) {
        return res.status(403).json({ error: 'Has alcanzado el límite de 1 intento permitido para la cuenta de prueba.' });
      }
      await pool.query('INSERT INTO trial_ips (ip) VALUES ($1)', [clientIp]);
    }

    console.log(`[Extract] Procesando imagen: ${req.file.filename} (${req.file.mimetype})`);

    // Llamar al servicio de AI para extraer specs
    const extractedData = await extractSpecsFromImage(req.file.path);

    // Guardar el requerimiento en la base de datos
    const requirement = await Requirement.create({
      image_path: req.file.filename,
      raw_text: JSON.stringify(extractedData),
      extracted_specs: extractedData,
    });

    res.json({
      success: true,
      requirement_id: requirement.id,
      equipos: extractedData.equipos || [],
      notas_adicionales: extractedData.notas_adicionales || '',
      image_filename: req.file.filename,
    });
  } catch (error) {
    console.error('[Extract] Error:', error.message);
    
    // Mensajes de error más específicos para el usuario
    let userMessage = 'Error al extraer especificaciones de la imagen';
    if (error.message.includes('AI_API_KEY')) {
      userMessage = 'Error de configuración: la API key de IA no está configurada.';
    } else if (error.message.includes('escaneado') || error.message.includes('protegido')) {
      userMessage = 'No pudimos leer el PDF. Si es un documento escaneado, intenta subirlo como imagen (captura de pantalla).';
    } else if (error.message.includes('JSON')) {
      userMessage = 'No pudimos interpretar el documento. Intenta con una imagen más clara o un formato diferente.';
    } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      userMessage = 'La solicitud tardó demasiado. Por favor intenta de nuevo.';
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      userMessage = 'Se alcanzó el límite de solicitudes a la API. Espera unos minutos e intenta de nuevo.';
    }
    
    res.status(500).json({
      error: userMessage,
      details: error.message,
    });
  }
}

/**
 * GET /api/requirements/:id
 * Obtiene un requerimiento por ID
 */
async function getRequirement(req, res) {
  try {
    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({ error: 'Requerimiento no encontrado' });
    }
    res.json(requirement);
  } catch (error) {
    console.error('[Extract] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/requirements/:id
 * Actualiza las specs extraídas (después de edición manual)
 */
async function updateRequirement(req, res) {
  try {
    const { extracted_specs } = req.body;
    if (!extracted_specs) {
      return res.status(400).json({ error: 'Se requiere el campo extracted_specs' });
    }

    const updated = await Requirement.update(req.params.id, { extracted_specs });
    if (!updated) {
      return res.status(404).json({ error: 'Requerimiento no encontrado' });
    }

    res.json({ success: true, requirement: updated });
  } catch (error) {
    console.error('[Extract] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/extract-url
 */
async function extractFromUrl(req, res) {
  try {
    const { url, token } = req.body;
    if (!url) return res.status(400).json({ error: 'URL no proporcionada' });

    console.log(`[ExtractUrl] Procesando URL remota: ${url.substring(0, 70)}...`);
    const result = await extractSpecsFromUrl(url.trim(), token);

    res.json({
      success: true,
      equipos: result.equipos || [],
      notas: result.notas_adicionales || '',
      openai_debug: 'OK'
    });
  } catch (error) {
    console.error('[ExtractUrl] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/proxy-image
 */
async function proxyImage(req, res) {
  try {
    const { url, token } = req.body;
    if (!url) return res.status(400).json({ error: 'URL no proporcionada' });

    const headers = {};
    if (token) headers['api_access_token'] = token;

    const resp = await axios.get(url, {
      headers,
      responseType: 'arraybuffer',
      timeout: 10000
    });

    res.json({
      base64: Buffer.from(resp.data).toString('base64'),
      mimeType: resp.headers['content-type'] || 'image/jpeg',
      bytes: resp.data.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  extractFromImage,
  extractFromUrl,
  proxyImage,
  getRequirement,
  updateRequirement,
};
