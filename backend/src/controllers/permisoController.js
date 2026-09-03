const pool = require('../config/db');

function coordsToWKT(coords) {
  const puntos = coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${puntos}))`;
}

async function crear(req, res) {
  const {
    rut_ejecutor,
    comuna_id,
    tipo_actividad,
    area,
    ventana_inicio,
    ventana_fin,
    empresa_ejecutora_id,
    nombre_empresa_ejecutora,
    altura_estimada_m,
  } = req.body;

  if (!rut_ejecutor || !comuna_id || !tipo_actividad || !area || !ventana_inicio || !ventana_fin) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const wkt = coordsToWKT(area);

  const { rows } = await pool.query(
    `SELECT * FROM fn_crear_permiso(
       $1, $2, $3, $4,
       ST_GeomFromText($5, 4326),
       $6, $7, $8, $9, $10
     )`,
    [
      req.usuario.sub,
      rut_ejecutor,
      comuna_id,
      tipo_actividad,
      wkt,
      ventana_inicio,
      ventana_fin,
      empresa_ejecutora_id || null,
      nombre_empresa_ejecutora || null,
      altura_estimada_m || null,
    ]
  );

  res.status(201).json(rows[0]);
}

async function activar(req, res) {
  const { foto_evidencia_url } = req.body;

  if (!foto_evidencia_url) {
    return res.status(400).json({ error: 'foto_evidencia_url es obligatoria' });
  }

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'ACTIVO',
         foto_evidencia_url = $1,
         geofencing_confirmado_at = now()
     WHERE id = $2 AND estado = 'APROBADO'
     RETURNING id, estado, geofencing_confirmado_at`,
    [foto_evidencia_url, req.params.id]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no está en estado APROBADO' });
  }

  res.json(rows[0]);
}

module.exports = { crear, activar };