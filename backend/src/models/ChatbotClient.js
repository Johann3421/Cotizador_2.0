const db = require('../db/connection');

class ChatbotClient {
  /**
   * Encuentra o crea un cliente por su número de teléfono
   */
  static async findOrCreate(phone, defaults = {}) {
    // Intentar encontrar
    let result = await db.query(
      'SELECT * FROM chatbot_clients WHERE phone = $1',
      [phone]
    );

    if (result.rows.length > 0) {
      // Actualizar último acceso
      await db.query(
        'UPDATE chatbot_clients SET updated_at = NOW() WHERE id = $1',
        [result.rows[0].id]
      );
      return { client: result.rows[0], isNew: false };
    }

    // Crear nuevo
    const { nombre, email, ruc, empresa, conversation_id } = defaults;
    result = await db.query(
      `INSERT INTO chatbot_clients (phone, nombre, email, ruc, empresa, conversation_id, estado_flujo)
       VALUES ($1, $2, $3, $4, $5, $6, 'nuevo')
       RETURNING *`,
      [phone, nombre || null, email || null, ruc || null, empresa || null, conversation_id || null]
    );

    return { client: result.rows[0], isNew: true };
  }

  /**
   * Busca un cliente por teléfono
   */
  static async findByPhone(phone) {
    const result = await db.query(
      'SELECT * FROM chatbot_clients WHERE phone = $1',
      [phone]
    );
    return result.rows[0] || null;
  }

  /**
   * Busca un cliente por conversation_id
   */
  static async findByConversation(conversationId) {
    const result = await db.query(
      'SELECT * FROM chatbot_clients WHERE conversation_id = $1',
      [conversationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Actualiza datos del cliente
   */
  static async update(phone, data) {
    const fields = [];
    const params = [];
    let idx = 1;

    const allowed = ['nombre', 'email', 'ruc', 'empresa', 'tipo_persona',
      'conversation_id', 'estado_flujo', 'ultimo_requerimiento_id',
      'ultima_cotizacion_id', 'datos_pendientes', 'notas'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        if (key === 'datos_pendientes') {
          fields.push(`${key} = $${idx++}`);
          params.push(JSON.stringify(data[key]));
        } else {
          fields.push(`${key} = $${idx++}`);
          params.push(data[key]);
        }
      }
    }

    if (fields.length === 0) return this.findByPhone(phone);

    fields.push('updated_at = NOW()');
    params.push(phone);

    const result = await db.query(
      `UPDATE chatbot_clients SET ${fields.join(', ')} WHERE phone = $${idx} RETURNING *`,
      params
    );
    return result.rows[0];
  }

  /**
   * Actualiza el estado del flujo comercial
   */
  static async updateEstado(phone, estado, datosExtra = {}) {
    const result = await db.query(
      `UPDATE chatbot_clients 
       SET estado_flujo = $1, 
           datos_pendientes = datos_pendientes || $2::jsonb,
           updated_at = NOW()
       WHERE phone = $3 
       RETURNING *`,
      [estado, JSON.stringify(datosExtra), phone]
    );
    return result.rows[0];
  }

  /**
   * Incrementa el contador de cotizaciones
   */
  static async incrementCotizaciones(phone, cotizacionId) {
    const result = await db.query(
      `UPDATE chatbot_clients 
       SET total_cotizaciones = total_cotizaciones + 1,
           ultima_cotizacion_id = $1,
           updated_at = NOW()
       WHERE phone = $2 
       RETURNING *`,
      [cotizacionId, phone]
    );
    return result.rows[0];
  }

  /**
   * Obtiene historial de cotizaciones del cliente
   */
  static async getHistory(phone) {
    const client = await this.findByPhone(phone);
    if (!client) return { client: null, quotes: [], interactions: [] };

    const quotes = await db.query(
      `SELECT q.* FROM quotes q
       INNER JOIN chatbot_clients c ON q.id = c.ultima_cotizacion_id OR q.cliente ILIKE '%' || c.nombre || '%'
       WHERE c.phone = $1 AND q.deleted_at IS NULL
       ORDER BY q.created_at DESC LIMIT 20`,
      [phone]
    );

    const interactions = await db.query(
      `SELECT * FROM chatbot_interactions 
       WHERE client_id = $1 
       ORDER BY created_at DESC LIMIT 50`,
      [client.id]
    );

    return {
      client,
      quotes: quotes.rows,
      interactions: interactions.rows,
    };
  }

  /**
   * Registra una interacción del chatbot
   */
  static async logInteraction(clientId, { conversationId, tipo, mensajeUsuario, respuestaBot, estadoFlujo, metadata = {} }) {
    const result = await db.query(
      `INSERT INTO chatbot_interactions 
       (client_id, conversation_id, tipo, mensaje_usuario, respuesta_bot, estado_flujo, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clientId, conversationId, tipo, mensajeUsuario, respuestaBot, estadoFlujo, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  /**
   * Dashboard: estadísticas de clientes chatbot
   */
  static async getStats() {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_clientes,
        COUNT(CASE WHEN estado_flujo = 'cotizacion_enviada' THEN 1 END) as con_cotizacion,
        COUNT(CASE WHEN estado_flujo = 'factura_generada' THEN 1 END) as con_factura,
        SUM(total_cotizaciones) as total_cotizaciones,
        SUM(total_compras) as total_compras_valor,
        COUNT(CASE WHEN updated_at > NOW() - INTERVAL '24 hours' THEN 1 END) as activos_24h
      FROM chatbot_clients
    `);

    const porEstado = await db.query(`
      SELECT estado_flujo, COUNT(*) as total 
      FROM chatbot_clients 
      GROUP BY estado_flujo 
      ORDER BY total DESC
    `);

    return {
      ...stats.rows[0],
      por_estado: porEstado.rows,
    };
  }
}

module.exports = ChatbotClient;
