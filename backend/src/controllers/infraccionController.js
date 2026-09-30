const pool = require('../config/db');
const bitacoraService = require('../services/bitacoraService');

// Contrato acordado con la app Supervisor (supervisor/src/services/infraccionService.js):
//   POST /api/infracciones { permiso_id?, rut_infractor, descripcion, ubicacion: { lat, lng }, evidencia_url? }
//   GET  /api/infracciones -> infracciones de la comuna, más recientes primero
// `permiso_id` es opcional: se fiscaliza también a camiones sin permiso.
async function crear(req, res) {
  const { permiso_id, rut_infractor, descripcion, ubicacion, evidencia_url } = req.body;

  if (!rut_infractor || !descripcion || !ubicacion || typeof ubicacion.lat !== 'number' || typeof ubicacion.lng !== 'number') {
    return res.status(400).json({ error: 'rut_infractor, descripcion y ubicacion son obligatorios' });
  }

  let comunaId = req.usuario.comuna_id;

  if (permiso_id) {
    const { rows } = await pool.query('SELECT comuna_id FROM permiso WHERE id = $1', [permiso_id]);
    if (!rows[0]) {
      return res.status(400).json({ error: 'permiso_id no corresponde a un permiso existente' });
    }
    comunaId = rows[0].comuna_id;
  }

  const { rows } = await pool.query(
    `INSERT INTO infraccion (permiso_id, rut_infractor, inspector_id, comuna_id, ubicacion, descripcion, evidencia_url)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8)
     RETURNING id, permiso_id, rut_infractor, inspector_id, comuna_id, descripcion, evidencia_url, fecha`,
    [permiso_id || null, rut_infractor, req.usuario.sub, comunaId, ubicacion.lng, ubicacion.lat, descripcion, evidencia_url || null]
  );

  const infraccion = rows[0];

  await bitacoraService.registrarEvento({
    permisoId: permiso_id || null,
    comunaId,
    tipoEvento: 'INFRACCION_CURSADA',
    detalle: { infraccion_id: infraccion.id, rut_infractor, descripcion },
    actorId: req.usuario.sub,
  });

  res.status(201).json(infraccion);
}

// GET /api/infracciones — de la comuna del inspector/operador, más recientes primero.
async function listar(req, res) {
  const { rows } = await pool.query(
    `SELECT id, permiso_id, rut_infractor, inspector_id, comuna_id, descripcion, evidencia_url, fecha,
            ST_AsGeoJSON(ubicacion)::json AS ubicacion
     FROM infraccion
     WHERE comuna_id = $1
     ORDER BY fecha DESC`,
    [req.usuario.comuna_id]
  );

  res.json(rows);
}

module.exports = { crear, listar };
