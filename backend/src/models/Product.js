const db = require('../db/connection');

class Product {
  static async create({ ficha_id, marca, nombre, specs, precio_referencial, url_ficha }) {
    const result = await db.query(
      `INSERT INTO products (ficha_id, marca, nombre, specs, precio_referencial, url_ficha, ultima_actualizacion) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (ficha_id) DO UPDATE SET
         marca = EXCLUDED.marca,
         nombre = EXCLUDED.nombre,
         specs = EXCLUDED.specs,
         precio_referencial = EXCLUDED.precio_referencial,
         url_ficha = EXCLUDED.url_ficha,
         ultima_actualizacion = NOW()
       RETURNING *`,
      [ficha_id, marca?.toLowerCase(), nombre, JSON.stringify(specs), precio_referencial, url_ficha]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findByFichaId(ficha_id) {
    const result = await db.query('SELECT * FROM products WHERE ficha_id = $1', [ficha_id]);
    return result.rows[0] || null;
  }

  static async findByMarca(marca, { limit = 50, offset = 0 } = {}) {
    const result = await db.query(
      `SELECT * FROM products WHERE LOWER(marca) = LOWER($1) 
       ORDER BY ultima_actualizacion DESC LIMIT $2 OFFSET $3`,
      [marca, limit, offset]
    );
    return result.rows;
  }

  static async findCached(marca, maxAgeHours = 24) {
    const result = await db.query(
      `SELECT * FROM products 
       WHERE LOWER(marca) = LOWER($1) 
         AND ultima_actualizacion > NOW() - INTERVAL '${maxAgeHours} hours'
       ORDER BY ultima_actualizacion DESC`,
      [marca]
    );
    return result.rows;
  }

  static async search(searchTerm, { marca, limit = 20 } = {}) {
    let queryText = `SELECT * FROM products WHERE (
      LOWER(nombre) LIKE LOWER($1) 
      OR specs::text ILIKE $1
    )`;
    const params = [`%${searchTerm}%`];

    if (marca) {
      queryText += ` AND LOWER(marca) = LOWER($2)`;
      params.push(marca);
    }

    queryText += ` ORDER BY ultima_actualizacion DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await db.query(queryText, params);
    return result.rows;
  }

  static async deleteOlderThan(hours = 168) {
    const result = await db.query(
      `DELETE FROM products WHERE ultima_actualizacion < NOW() - INTERVAL '${hours} hours'`
    );
    return result.rowCount;
  }
}

module.exports = Product;
