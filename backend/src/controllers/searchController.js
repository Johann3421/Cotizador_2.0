const { searchCompatibleProducts, searchFichasByMarcaYTipo } = require('../services/scraperService');
const Requirement = require('../models/Requirement');
const Product = require('../models/Product');

const MARCAS_SOPORTADAS = ['kenya', 'lenovo', 'hp'];

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
      const productos = await searchCompatibleProducts(equipo);

      resultados.push({
        equipo,
        productos_kenya: (productos.kenya || []).map(p => ({
          fichaId:     p.fichaId,
          nombre:      p.nombre,
          marca:       'kenya',
          numeroParte: p.numeroParte,
          imgUrl:      p.imgUrl,
          pdfUrl:      p.pdfUrl,
          specsObj:    p.specsObj,
          specsFp:     p.specsFp,
          estado:      p.estado,
          score:       p.score,
          urlBuscador: p.urlBuscador,
          pdfSpecs:    p.pdfSpecs,
        })),
        productos_lenovo: (productos.lenovo || []).map(p => ({
          fichaId:     p.fichaId,
          nombre:      p.nombre,
          marca:       'lenovo',
          numeroParte: p.numeroParte,
          imgUrl:      p.imgUrl,
          pdfUrl:      p.pdfUrl,
          specsObj:    p.specsObj,
          specsFp:     p.specsFp,
          estado:      p.estado,
          score:       p.score,
          urlBuscador: p.urlBuscador,
          pdfSpecs:    p.pdfSpecs,
        })),
        productos_hp: (productos.hp || []).map(p => ({
          fichaId:     p.fichaId,
          nombre:      p.nombre,
          marca:       'hp',
          numeroParte: p.numeroParte,
          imgUrl:      p.imgUrl,
          pdfUrl:      p.pdfUrl,
          specsObj:    p.specsObj,
          specsFp:     p.specsFp,
          estado:      p.estado,
          score:       p.score,
          urlBuscador: p.urlBuscador,
          pdfSpecs:    p.pdfSpecs,
        })),
      });
    }

    res.json({
      success: true,
      requirement_id,
      resultados,
      marcas_disponibles: MARCAS_SOPORTADAS,
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

    if (!MARCAS_SOPORTADAS.includes(marca.toLowerCase())) {
      return res.status(400).json({
        error: `Marca "${marca}" no soportada. Usa: ${MARCAS_SOPORTADAS.join(', ')}`,
      });
    }

    console.log(`[Search] Forzando actualización de catálogo: ${marca} (${tipo_equipo || 'desktop'})...`);
    const productos = await searchFichasByMarcaYTipo(marca.toLowerCase(), tipo_equipo || 'desktop', 20);

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
    const product = await Product.findByFichaId(req.params.fichaId);

    if (!product) {
      return res.status(404).json({ error: 'Ficha no encontrada' });
    }

    // Enrich with pdfUrl from specs JSONB if not in dedicated column
    const specs = typeof product.specs === 'string' ? JSON.parse(product.specs) : (product.specs || {});
    const pdfUrl = product.pdf_url || specs.pdfUrl || null;

    res.json({ ...product, pdfUrl });
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
