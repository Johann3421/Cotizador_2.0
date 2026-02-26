const db = require('../db/connection');

class Quote {
  static async generateNumber() {
    const prefix = process.env.QUOTE_PREFIX || 'KEN';
    const year = new Date().getFullYear();
    
    const result = await db.query(
      `SELECT numero_cotizacion FROM quotes 
       WHERE numero_cotizacion LIKE $1 
       ORDER BY created_at DESC LIMIT 1`,
      [`${prefix}-${year}-%`]
    );

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastNum = result.rows[0].numero_cotizacion;
      const parts = lastNum.split('-');
      nextNum = parseInt(parts[2], 10) + 1;
    }

    return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
  }

  static async create({ cliente, ruc, requirement_id, items, notas }) {
    const numero_cotizacion = await this.generateNumber();
    
    // Calcular totales
    let subtotal = 0;
    if (items && Array.isArray(items)) {
      subtotal = items.reduce((sum, item) => {
        return sum + (parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1);
      }, 0);
    }
    const igv = subtotal * 0.18;
    const total = subtotal + igv;

    const result = await db.query(
      `INSERT INTO quotes (numero_cotizacion, cliente, ruc, requirement_id, items, subtotal, igv, total, estado, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'borrador', $9)
       RETURNING *`,
      [numero_cotizacion, cliente, ruc, requirement_id, JSON.stringify(items), subtotal, igv, total, notas]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await db.query(
      `SELECT q.*, r.extracted_specs as requirement_specs
       FROM quotes q
       LEFT JOIN requirements r ON q.requirement_id = r.id
       WHERE q.id = $1 AND q.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async findAll({ limit = 20, offset = 0, estado, search } = {}) {
    let queryText = `SELECT * FROM quotes WHERE deleted_at IS NULL`;
    const params = [];
    let paramIndex = 1;

    if (estado) {
      queryText += ` AND estado = $${paramIndex}`;
      params.push(estado);
      paramIndex++;
    }

    if (search) {
      queryText += ` AND (
        numero_cotizacion ILIKE $${paramIndex} 
        OR cliente ILIKE $${paramIndex}
        OR ruc ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Count total
    const countResult = await db.query(
      queryText.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(queryText, params);
    return { quotes: result.rows, total, limit, offset };
  }

  static async update(id, { cliente, ruc, items, notas, estado }) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (cliente !== undefined) { fields.push(`cliente = $${paramIndex++}`); params.push(cliente); }
    if (ruc !== undefined) { fields.push(`ruc = $${paramIndex++}`); params.push(ruc); }
    if (notas !== undefined) { fields.push(`notas = $${paramIndex++}`); params.push(notas); }
    if (estado !== undefined) { fields.push(`estado = $${paramIndex++}`); params.push(estado); }
    
    if (items !== undefined) {
      fields.push(`items = $${paramIndex++}`);
      params.push(JSON.stringify(items));
      
      let subtotal = items.reduce((sum, item) => {
        return sum + (parseFloat(item.precio_unitario) || 0) * (parseInt(item.cantidad) || 1);
      }, 0);
      const igv = subtotal * 0.18;
      const total = subtotal + igv;
      
      fields.push(`subtotal = $${paramIndex++}`); params.push(subtotal);
      fields.push(`igv = $${paramIndex++}`); params.push(igv);
      fields.push(`total = $${paramIndex++}`); params.push(total);
    }

    fields.push(`updated_at = NOW()`);

    if (fields.length === 1) return this.findById(id); // solo updated_at

    params.push(id);
    const result = await db.query(
      `UPDATE quotes SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      params
    );
    return result.rows[0];
  }

  static async softDelete(id) {
    const result = await db.query(
      `UPDATE quotes SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
}

module.exports = Quote;
