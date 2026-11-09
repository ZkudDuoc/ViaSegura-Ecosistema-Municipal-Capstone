const pool = require('../config/db');

// Público (se necesita antes de iniciar sesión). `habilitada`: la comuna ya
// permite reservar; `limite`: su contorno en GeoJSON (MultiPolygon) o null si
// todavía no está cargado (las comunas no habilitadas no lo tienen).
async function listar(req, res) {
  const { rows } = await pool.query(
    `SELECT id, nombre, sla_confirmacion_min, sla_escolta_min, habilitada,
            ST_AsGeoJSON(limite)::json AS limite
     FROM comuna ORDER BY nombre`
  );
  res.json(rows);
}

module.exports = { listar };
