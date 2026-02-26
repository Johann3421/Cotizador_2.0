import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 minutos para operaciones de scraping/AI
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para manejar errores globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.response?.data?.details || error.message || 'Error de conexión';
    console.error('API Error:', message);
    return Promise.reject({ message, status: error.response?.status });
  }
);

// ============================================
// EXTRACTION API
// ============================================

/**
 * Sube una imagen y extrae specs con AI
 */
export async function extractFromImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const response = await api.post('/extract', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return response.data;
}

/**
 * Obtiene un requerimiento por ID
 */
export async function getRequirement(id) {
  const response = await api.get(`/requirements/${id}`);
  return response.data;
}

/**
 * Actualiza las specs extraídas
 */
export async function updateRequirement(id, extractedSpecs) {
  const response = await api.put(`/requirements/${id}`, { extracted_specs: extractedSpecs });
  return response.data;
}

// ============================================
// SEARCH API
// ============================================

/**
 * Busca productos en PeruCompras
 */
export async function searchProducts(requirementId, specs) {
  const response = await api.post('/search', {
    requirement_id: requirementId,
    specs,
  });
  return response.data;
}

/**
 * Fuerza actualización de catálogo de una marca
 */
export async function refreshCatalog(marca, tipoEquipo) {
  const response = await api.post('/search/refresh', {
    marca,
    tipo_equipo: tipoEquipo,
  });
  return response.data;
}

/**
 * Obtiene detalle de un producto
 */
export async function getProduct(id) {
  const response = await api.get(`/products/${id}`);
  return response.data;
}

// ============================================
// QUOTES API
// ============================================

/**
 * Crea una cotización
 */
export async function createQuote({ cliente, ruc, requirementId, items, notas }) {
  const response = await api.post('/quote', {
    cliente,
    ruc,
    requirement_id: requirementId,
    items,
    notas,
  });
  return response.data;
}

/**
 * Lista cotizaciones
 */
export async function listQuotes({ page = 1, limit = 20, estado, search } = {}) {
  const params = { page, limit };
  if (estado) params.estado = estado;
  if (search) params.search = search;

  const response = await api.get('/quotes', { params });
  return response.data;
}

/**
 * Obtiene una cotización por ID
 */
export async function getQuote(id) {
  const response = await api.get(`/quotes/${id}`);
  return response.data;
}

/**
 * Actualiza una cotización
 */
export async function updateQuote(id, data) {
  const response = await api.put(`/quotes/${id}`, data);
  return response.data;
}

/**
 * Elimina una cotización (soft delete)
 */
export async function deleteQuote(id) {
  const response = await api.delete(`/quotes/${id}`);
  return response.data;
}

/**
 * Descarga el PDF de una cotización
 */
export function getQuotePDFUrl(id) {
  return `/api/quotes/${id}/pdf`;
}

/**
 * Regenera el PDF de una cotización
 */
export async function regeneratePDF(id) {
  const response = await api.post(`/quotes/${id}/regenerate-pdf`);
  return response.data;
}

// ============================================
// ADMIN API — Sincronización del catálogo
// ============================================

/**
 * Dispara la sincronización manual del catálogo PeruCompras (background)
 */
export async function triggerCatalogSync() {
  const response = await api.post('/admin/sync');
  return response.data;
}

/**
 * Consulta el estado actual del catálogo en la base de datos
 */
export async function getCatalogStatus() {
  const response = await api.get('/admin/catalog-status');
  return response.data;
}

export default api;
