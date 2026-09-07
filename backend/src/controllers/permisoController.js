const pool = require('../config/db');
const riskService = require('../services/riskService');

const NIVEL_LABEL = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

// La app móvil envía el polígono sin repetir el primer punto al final
// (lo cierra el propio Backend, ver app-movil/src/services/permisoService.js).
function cerrarAnillo(coords) {
  const anillo = coords.map(([lng, lat]) => [lng, lat]);
  const [primerLng, primerLat] = anillo[0];
  const [ultimoLng, ultimoLat] = anillo[anillo.length - 1];

  if (primerLng !== ultimoLng || primerLat !== ultimoLat) {
    anillo.push([primerLng, primerLat]);
  }

  return anillo;
}

function anilloToWKT(anillo) {
  const puntos = anillo.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
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

  if (!Array.isArray(area) || area.length < 3) {
    return res.status(400).json({ error: 'area debe ser un polígono con al menos 3 puntos' });
  }

  const anillo = cerrarAnillo(area);
  const wkt = anilloToWKT(anillo);

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

  const permiso = rows[0];

  // Integración con el Microservicio de Riesgo (Módulo 3): si no responde,
  // el permiso queda creado igual y sin evaluación (se puede reintentar).
  let riesgo = null;
  try {
    const resultado = await riskService.evaluarRiesgo({
      poligono: { type: 'Polygon', coordinates: [anillo] },
      fecha: String(ventana_inicio).slice(0, 10),
      tipo_actividad,
    });

    const nivel = resultado.nivel.toUpperCase();

    await pool.query(
      `INSERT INTO evaluacion_riesgo (permiso_id, score, nivel, detalle)
       VALUES ($1, $2, $3, $4)`,
      [permiso.id, resultado.risk_score, nivel, resultado]
    );

    riesgo = {
      nivel: NIVEL_LABEL[nivel] ?? resultado.nivel,
      score: resultado.risk_score,
      congestion: resultado.congestion_score,
    };
  } catch (err) {
    console.error(`No se pudo evaluar el riesgo del permiso ${permiso.id}:`, err.message);
  }

  res.status(201).json({ ...permiso, riesgo });
}

async function listar(req, res) {
  const { rol, comuna_id, sub } = req.usuario;
  const esMunicipal = ROLES_MUNICIPALES.includes(rol);

  const { rows } = await pool.query(
    `SELECT
       p.id, p.usuario_id, p.rut_ejecutor, p.empresa_ejecutora_id, p.nombre_empresa_ejecutora,
       p.comuna_id, p.tipo_actividad, p.altura_estimada_m, p.estado, p.motivo_cola,
       p.ventana_inicio, p.ventana_fin, p.foto_evidencia_url, p.geofencing_confirmado_at,
       p.created_at, p.updated_at,
       ST_AsGeoJSON(p.area)::json AS area,
       er.nivel AS nivel_riesgo, er.score AS score_riesgo
     FROM permiso p
     LEFT JOIN LATERAL (
       SELECT nivel, score FROM evaluacion_riesgo e
       WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
     ) er ON true
     WHERE ${esMunicipal ? 'p.comuna_id = $1' : 'p.usuario_id = $1'}
     ORDER BY p.created_at DESC`,
    [esMunicipal ? comuna_id : sub]
  );

  const permisos = rows.map(({ nivel_riesgo, ...permiso }) => ({
    ...permiso,
    riesgo: NIVEL_LABEL[nivel_riesgo] ?? null,
  }));

  res.json(permisos);
}

async function aprobar(req, res) {
  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'APROBADO'
     WHERE id = $1 AND comuna_id = $2 AND estado = 'PENDIENTE_CONFIRMACION_MUNICIPAL'
     RETURNING id, estado`,
    [req.params.id, req.usuario.comuna_id]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no está en estado PENDIENTE_CONFIRMACION_MUNICIPAL' });
  }

  res.json(rows[0]);
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

module.exports = { crear, listar, aprobar, activar };
