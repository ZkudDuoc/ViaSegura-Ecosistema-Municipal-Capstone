const pool = require('../config/db');

async function listar(req, res) {
  const { rows } = await pool.query(
    'SELECT id, nombre, sla_confirmacion_min, sla_escolta_min FROM comuna ORDER BY nombre'
  );
  res.json(rows);
}

module.exports = { listar };
