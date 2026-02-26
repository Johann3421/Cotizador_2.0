const { searchProducts, forceRefresh, getFichaDetails, MARCAS_PRIORITARIAS } = require('../services/scraperService');
const Requirement = require('../models/Requirement');
const Product = require('../models/Product');

/**
 * POST /api/search
 * Busca productos en PeruCompras basado en los specs extraídos
 */
async function searchBySpecs(req, res) {
  try {
    const { requirement_id, specs } = req.body;

    if (!specs || !Array.isArray(specs) || specs.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array "specs" con al menos un equipo' });
    }

    console.log(`[Search] Buscando productos para ${specs.length} equipo(s)...`);

    const resultados = [];

    for (const equipo of specs) {
      const productos = await searchProducts(equipo);

      resultados.push({
        equipo,
        productos_kenya: productos.kenya || [],
        productos_lenovo: productos.lenovo || [],
        productos_hp: productos.hp || [],
      });
    }

    res.json({
      success: true,
      requirement_id,
      resultados,
      marcas_disponibles: MARCAS_PRIORITARIAS,
    });
  } catch (error) {
    console.error('[Search] Error:', error.message);
    res.status(500).json({
      error: 'Error al buscar productos en PeruCompras',
      details: error.message,
    });
  }
}

/**
 * POST /api/search/refresh
 * Fuerza re-scraping de una marca específica
 */
async function refreshCatalog(req, res) {
  try {
    const { marca, tipo_equipo } = req.body;

    if (!marca) {
      return res.status(400).json({ error: 'Se requiere el campo "marca"' });
    }

    if (!MARCAS_PRIORITARIAS.includes(marca.toLowerCase())) {
      return res.status(400).json({
        error: `Marca "${marca}" no soportada. Usa: ${MARCAS_PRIORITARIAS.join(', ')}`,
      });
    }

    console.log(`[Search] Forzando actualización de catálogo: ${marca} (${tipo_equipo || 'laptop'})...`);
    const productos = await forceRefresh(marca.toLowerCase(), tipo_equipo || 'laptop');

    res.json({
      success: true,
      marca,
      productos_actualizados: productos.length,
      productos,
    });
  } catch (error) {
    console.error('[Search] Error en refresh:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/products/:id
 * Obtiene detalle de un producto
 */
async function getProduct(req, res) {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(product);
  } catch (error) {
    console.error('[Search] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/products/ficha/:fichaId
 * Obtiene detalle de una ficha de PeruCompras
 */
async function getFicha(req, res) {
  try {
    let product = await Product.findByFichaId(req.params.fichaId);

    if (product && product.url_ficha) {
      // Obtener detalles completos
      const detalles = await getFichaDetails(product.url_ficha);
      res.json({ ...product, detalles });
    } else if (product) {
      res.json(product);
    } else {
      res.status(404).json({ error: 'Ficha no encontrada' });
    }
  } catch (error) {
    console.error('[Search] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  searchBySpecs,
  refreshCatalog,
  getProduct,
  getFicha,
};
