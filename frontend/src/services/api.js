import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── JWT Interceptor (request) ──
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response Interceptor (manejo de 401) ──
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    if (status === 401 || code === 'TOKEN_EXPIRED') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirigir a login si no estamos ya ahí
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    const message = error.response?.data?.error || error.response?.data?.details || error.message || 'Error de conexión';
    console.error('API Error:', message);
    return Promise.reject({ message, status });
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

// ============================================
// AUTH API
// ============================================

export async function loginUser(email, password) {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
}

export async function registerUser(data) {
  const response = await api.post('/auth/register', data);
  return response.data;
}

export async function logoutUser() {
  const response = await api.post('/auth/logout');
  return response.data;
}

export async function getMe() {
  const response = await api.get('/auth/me');
  return response.data;
}

// ============================================
// ADMIN API — Usuarios
// ============================================

export async function getAdminStats() {
  const response = await api.get('/admin/stats');
  return response.data;
}

export async function listUsers(params = {}) {
  const response = await api.get('/admin/users', { params });
  return response.data;
}

export async function approveUser(id) {
  const response = await api.patch(`/admin/users/${id}/approve`);
  return response.data;
}

export async function rejectUser(id, motivo) {
  const response = await api.patch(`/admin/users/${id}/reject`, { motivo });
  return response.data;
}

export async function changeUserRole(id, rol) {
  const response = await api.patch(`/admin/users/${id}/role`, { rol });
  return response.data;
}

// ============================================
// ADMIN API — Solicitudes de cotización
// ============================================

export async function listQuoteRequests(params = {}) {
  const response = await api.get('/admin/quote-requests', { params });
  return response.data;
}

export async function getQuoteRequest(id) {
  const response = await api.get(`/admin/quote-requests/${id}`);
  return response.data;
}

export async function updateQuoteRequestStatus(id, estado) {
  const response = await api.patch(`/admin/quote-requests/${id}/status`, { estado });
  return response.data;
}

export async function markQuoteRequestSent(id, pdfUrl) {
  const response = await api.patch(`/admin/quote-requests/${id}/sent`, { pdf_url: pdfUrl });
  return response.data;
}

// ============================================
// USER API — Solicitudes de cotización (usuario)
// ============================================

export async function createQuoteRequest(data) {
  const response = await api.post('/quote-requests', data);
  return response.data;
}

// ============================================
// NOTIFICATIONS API
// ============================================

export async function getNotifications(unread = false) {
  const response = await api.get('/admin/notifications', { params: { unread } });
  return response.data;
}

export async function getUnreadCount() {
  const response = await api.get('/admin/notifications/count');
  return response.data;
}

export async function markNotificationsRead() {
  const response = await api.patch('/admin/notifications/read');
  return response.data;
}

export default api;
