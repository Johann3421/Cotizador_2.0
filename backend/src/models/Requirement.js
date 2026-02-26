const db = require('../db/connection');

class Requirement {
  static async create({ image_path, raw_text, extracted_specs }) {
    const result = await db.query(
      `INSERT INTO requirements (image_path, raw_text, extracted_specs) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [image_path, raw_text, JSON.stringify(extracted_specs)]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await db.query('SELECT * FROM requirements WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findAll({ limit = 50, offset = 0 } = {}) {
    const result = await db.query(
      'SELECT * FROM requirements ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  static async update(id, { extracted_specs }) {
    const result = await db.query(
      `UPDATE requirements SET extracted_specs = $1 WHERE id = $2 RETURNING *`,
      [JSON.stringify(extracted_specs), id]
    );
    return result.rows[0];
  }
}

module.exports = Requirement;
