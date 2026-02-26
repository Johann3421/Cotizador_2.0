const { extractSpecsFromImage } = require('../services/aiService');
const Requirement = require('../models/Requirement');

/**
 * POST /api/extract
 * Recibe una imagen y extrae los requerimientos técnicos usando AI Vision
 */
async function extractFromImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen. Envía un archivo en el campo "image".' });
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
    res.status(500).json({
      error: 'Error al extraer especificaciones de la imagen',
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

module.exports = {
  extractFromImage,
  getRequirement,
  updateRequirement,
};
