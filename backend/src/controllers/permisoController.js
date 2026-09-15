const pool = require('../config/db');
const riskService = require('../services/riskService');
const bitacoraService = require('../services/bitacoraService');

const NIVEL_LABEL = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

// Estados desde los que un permiso todavía puede revocarse (6.2: la
// revocación siempre es una acción humana, nunca automática).
const ESTADOS_REVOCABLES = [
  'PENDIENTE_CONFIRMACION_MUNICIPAL',
  'APROBADO',
  'EN_COLA_ESPERA',
  'ACTIVO',
  'ACTIVO_PENDIENTE_EVIDENCIA',
];

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
  let estadoFinal = permiso.estado;
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

    // Riesgo ALTO sin móvil de escolta asignado todavía: entra a la cola de
    // espera con prioridad (v_cola_espera) hasta que un operador municipal
    // asigne un móvil (ver asignarMovil / fn_promover_desde_cola_por_movil).
    // Si ya quedó EN_COLA_ESPERA por conflicto de reserva, se respeta ese motivo.
    if (nivel === 'ALTO' && permiso.estado === 'PENDIENTE_CONFIRMACION_MUNICIPAL') {
      const { rows: colaRows } = await pool.query(
        `UPDATE permiso SET estado = 'EN_COLA_ESPERA', motivo_cola = 'RIESGO_ALTO_SIN_MOVIL'
         WHERE id = $1 RETURNING estado`,
        [permiso.id]
      );
      estadoFinal = colaRows[0].estado;
    }
  } catch (err) {
    console.error(`No se pudo evaluar el riesgo del permiso ${permiso.id}:`, err.message);
  }

  res.status(201).json({ ...permiso, estado: estadoFinal, riesgo });
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

// GET /api/permisos/cola — cola de espera de la comuna del operador,
// ordenada por prioridad (v_cola_espera: EMERGENCIA > menor riesgo > FIFO).
async function cola(req, res) {
  const { rows } = await pool.query(
    `SELECT
       v.id, v.usuario_id, v.rut_ejecutor, v.comuna_id, v.tipo_actividad,
       v.estado, v.motivo_cola, v.ventana_inicio, v.ventana_fin,
       v.created_at, v.updated_at, v.ultimo_score,
       ST_AsGeoJSON(v.area)::json AS area
     FROM v_cola_espera v
     WHERE v.comuna_id = $1
     ORDER BY (v.tipo_actividad = 'EMERGENCIA') DESC, v.ultimo_score ASC NULLS LAST, v.created_at ASC`,
    [req.usuario.comuna_id]
  );

  res.json(rows);
}

// PATCH /api/permisos/:id/revocar — siempre acción humana de un operador
// municipal (6.2). Nunca la dispara un job automático.
async function revocar(req, res) {
  const { motivo } = req.body;

  const { rows } = await pool.query(
    `UPDATE permiso
     SET estado = 'REVOCADO', revocado_por = $1, revocado_at = now()
     WHERE id = $2 AND comuna_id = $3 AND estado = ANY($4::estado_permiso[])
     RETURNING id, estado, revocado_por, revocado_at`,
    [req.usuario.sub, req.params.id, req.usuario.comuna_id, ESTADOS_REVOCABLES]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'El permiso no existe o ya no puede revocarse' });
  }

  const permiso = rows[0];

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'REVOCACION_PERMISO',
    accion: 'REVOCAR',
    detalle: { motivo: motivo || null },
    actorId: req.usuario.sub,
  });

  res.json(permiso);
}

// PATCH /api/permisos/:id/asignar-movil — asigna escolta municipal.
// Si el permiso estaba EN_COLA_ESPERA por RIESGO_ALTO_SIN_MOVIL, el trigger
// fn_promover_desde_cola_por_movil lo saca de la cola automáticamente.
async function asignarMovil(req, res) {
  const { identificador_movil } = req.body;

  if (!identificador_movil) {
    return res.status(400).json({ error: 'identificador_movil es obligatorio' });
  }

  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id, estado FROM permiso WHERE id = $1 AND comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );

  if (!permisoRows[0]) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const { rows } = await pool.query(
    `INSERT INTO movil_asignado (permiso_id, identificador_movil, asignado_por)
     VALUES ($1, $2, $3)
     RETURNING id, permiso_id, identificador_movil, asignado_at`,
    [req.params.id, identificador_movil, req.usuario.sub]
  );

  await bitacoraService.registrarEvento({
    permisoId: req.params.id,
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'ASIGNACION_MOVIL',
    accion: 'ASIGNAR_SEGURIDAD',
    detalle: { identificador_movil },
    actorId: req.usuario.sub,
  });

  const { rows: actualizado } = await pool.query(
    `SELECT id, estado, motivo_cola FROM permiso WHERE id = $1`,
    [req.params.id]
  );

  res.status(201).json({ movil: rows[0], permiso: actualizado[0] });
}

// GET /api/permisos/:id/bitacora — historial append-only del permiso.
async function bitacora(req, res) {
  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id, usuario_id FROM permiso WHERE id = $1`,
    [req.params.id]
  );
  const permiso = permisoRows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const esMunicipal = ROLES_MUNICIPALES.includes(req.usuario.rol);
  const esDueno = permiso.usuario_id === req.usuario.sub;
  const mismaComuna = permiso.comuna_id === req.usuario.comuna_id;

  if (!esDueno && !(esMunicipal && mismaComuna)) {
    return res.status(403).json({ error: 'Sin acceso a la bitácora de este permiso' });
  }

  const eventos = await bitacoraService.listarPorPermiso(req.params.id);
  res.json(eventos);
}

module.exports = { crear, listar, aprobar, activar, cola, revocar, asignarMovil, bitacora };
