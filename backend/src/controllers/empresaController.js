const pool = require('../config/db');

async function listar(req, res) {
  const { rows } = await pool.query(
    'SELECT id, nombre, rut_empresa FROM empresa ORDER BY nombre'
  );
  res.json(rows);
}

module.exports = { listar };
