const pool = require('../config/db');
const { esUuid, fechaIso, rangoFechasValidado, errorValidacion } = require('../utils/validar');
const { leerLimite, decodificarCursor, armarPagina } = require('../utils/paginacion');

const NIVEL_LABEL = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };
const ZONA = 'America/Santiago';

const ESTADOS_EXACTOS = [
  'PENDIENTE_CONFIRMACION_MUNICIPAL',
  'APROBADO',
  'EN_COLA_ESPERA',
  'ACTIVO',
  'ACTIVO_PENDIENTE_EVIDENCIA',
  'FINALIZADO',
  'EXPIRADO',
  'REVOCADO',
  'RECHAZADO',
  'SUSPENDIDO',
  'EN_REVISION',
];

// Grupos pensados para la empresa (el filtro "estado del trabajo").
const GRUPOS = {
  pendiente: "p.estado IN ('PENDIENTE_CONFIRMACION_MUNICIPAL', 'EN_COLA_ESPERA')", // esperando a la municipalidad
  aprobada_futura: "(p.estado = 'APROBADO' AND p.ventana_inicio > now())", // aprobada, aún no parte
  en_curso: "p.estado IN ('ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA')",
  terminada: "p.estado IN ('FINALIZADO', 'EXPIRADO')",
  rechazada: "p.estado = 'RECHAZADO'",
  en_revision: "p.estado = 'EN_REVISION'", // la municipalidad pidió cambiar el horario o los datos
  por_aplazar: "p.estado = 'EN_REVISION'", // alias de en_revision
};

function empresaDe(req, res) {
  const empresaId = req.usuario.empresa_id;
  if (!empresaId) {
    res.status(403).json({ error: 'Tu cuenta no está asociada a una empresa' });
    return null;
  }
  return empresaId;
}

function escaparLike(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

// GET /api/empresa/solicitudes — TODOS los permisos de la empresa (no solo
// los que creó el usuario). Filtros: q, desde/hasta (sobre ventana_inicio),
// grupo (pendiente|aprobada_futura|en_curso|terminada|rechazada|en_revision|
// por_aplazar o un estado exacto), con_multas, orden (asc|desc por fecha de
// creación), limit (25 por defecto, máx. 100) y cursor.
async function solicitudes(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  const { q, desde, hasta, grupo, con_multas, orden, cursor } = req.query;
  const limite = leerLimite(req.query.limit);
  const params = [empresaId];
  const condiciones = ['p.empresa_id = $1'];

  if (grupo) {
    if (GRUPOS[grupo]) condiciones.push(GRUPOS[grupo]);
    else if (ESTADOS_EXACTOS.includes(grupo)) {
      params.push(grupo);
      condiciones.push(`p.estado = $${params.length}::estado_permiso`);
    } else return res.status(400).json({ error: 'grupo no es válido' });
  }

  if (desde) {
    const fecha = fechaIso(desde);
    if (!fecha) return res.status(400).json({ error: 'desde no es una fecha ISO válida' });
    params.push(fecha);
    condiciones.push(`p.ventana_inicio >= $${params.length}`);
  }
  if (hasta) {
    const fecha = fechaIso(hasta);
    if (!fecha) return res.status(400).json({ error: 'hasta no es una fecha ISO válida' });
    params.push(fecha);
    condiciones.push(`p.ventana_inicio <= $${params.length}`);
  }

  if (con_multas !== undefined) {
    if (!['true', 'false'].includes(con_multas)) return res.status(400).json({ error: 'con_multas debe ser true o false' });
    condiciones.push(`${con_multas === 'true' ? '' : 'NOT '}EXISTS (SELECT 1 FROM infraccion i WHERE i.permiso_id = p.id)`);
  }

  if (q && String(q).trim()) {
    const texto = String(q).trim();
    params.push(`%${escaparLike(texto.replace(/[.\s-]/g, ''))}%`, `${escaparLike(texto)}%`);
    condiciones.push(
      `(replace(replace(v.patente, '-', ''), ' ', '') ILIKE $${params.length - 1}
        OR replace(p.rut_ejecutor, '-', '') ILIKE $${params.length - 1}
        OR p.id::text ILIKE $${params.length})`
    );
  }

  const ascendente = orden === 'asc';
  if (orden !== undefined && !['asc', 'desc'].includes(orden)) {
    return res.status(400).json({ error: 'orden debe ser asc o desc' });
  }

  if (cursor) {
    const c = decodificarCursor(cursor);
    if (!c || !esUuid(c.id)) return res.status(400).json({ error: 'cursor inválido' });
    params.push(c.creado, c.id);
    condiciones.push(
      `(p.created_at, p.id) ${ascendente ? '>' : '<'} ($${params.length - 1}::timestamptz, $${params.length}::uuid)`
    );
  }
  params.push(limite + 1);

  const { rows } = await pool.query(
    `SELECT
       p.id, v.patente AS patente, p.estado, p.tipo_actividad, p.rut_ejecutor,
       p.ventana_inicio, p.ventana_fin, p.created_at,
       er.nivel AS nivel_riesgo, er.score AS score_riesgo,
       (SELECT count(*) FROM infraccion i WHERE i.permiso_id = p.id)::int AS n_multas,
       p.created_at::text AS cursor_creado
     FROM permiso p
     LEFT JOIN vehiculo v ON v.id = p.vehiculo_id
     LEFT JOIN LATERAL (
       SELECT nivel, score FROM evaluacion_riesgo e
       WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
     ) er ON true
     WHERE ${condiciones.join(' AND ')}
     ORDER BY p.created_at ${ascendente ? 'ASC' : 'DESC'}, p.id ${ascendente ? 'ASC' : 'DESC'}
     LIMIT $${params.length}`,
    params
  );

  const { items, next_cursor } = armarPagina(rows, limite);

  res.json({
    items: items.map(({ nivel_riesgo, ...item }) => ({
      ...item,
      riesgo: NIVEL_LABEL[nivel_riesgo] ?? null,
      tiene_multas: item.n_multas > 0,
    })),
    next_cursor,
  });
}

// GET /api/empresa/solicitudes/:id/multas — multas de una solicitud de la empresa.
async function multasDeSolicitud(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;
  if (!esUuid(req.params.id)) return res.status(400).json({ error: 'id inválido' });

  const { rows: permisoRows } = await pool.query('SELECT id FROM permiso WHERE id = $1 AND empresa_id = $2', [
    req.params.id,
    empresaId,
  ]);
  if (!permisoRows[0]) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const { rows } = await pool.query(
    `SELECT i.id, i.rut_infractor, i.descripcion, i.evidencia_url, i.fecha,
            ST_AsGeoJSON(i.ubicacion)::json AS ubicacion, u.nombre AS inspector
     FROM infraccion i
     LEFT JOIN usuario u ON u.id = i.inspector_id
     WHERE i.permiso_id = $1
     ORDER BY i.fecha DESC`,
    [req.params.id]
  );

  res.json(rows);
}

// GET /api/empresa/resumen — contadores y alertas para la pantalla de inicio.
// "por_vencer" = dentro de los próximos 30 días. Las multas aún no tienen un
// estado de pago/validación, así que `multas_pendientes` cuenta todas las
// multas registradas contra los permisos de la empresa.
async function resumen(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  const [empresa, porEstado, multas, nomina] = await Promise.all([
    pool.query('SELECT razon_social, nombre, nombre_fantasia FROM empresa WHERE id = $1', [empresaId]),
    pool.query('SELECT estado, count(*)::int AS total FROM permiso WHERE empresa_id = $1 GROUP BY estado', [empresaId]),
    pool.query(
      `SELECT count(*)::int AS total
       FROM infraccion i JOIN permiso p ON p.id = i.permiso_id
       WHERE p.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT
         (SELECT count(*) FROM trabajador WHERE empresa_id = $1 AND activo = true)::int AS trabajadores_activos,
         (SELECT count(*) FROM vehiculo WHERE empresa_id = $1 AND activo = true)::int AS vehiculos_activos,
         (SELECT count(*) FROM trabajador
            WHERE empresa_id = $1 AND activo = true
              AND contrato_vigente_hasta BETWEEN current_date AND current_date + 30)::int AS contratos_por_vencer,
         (SELECT count(*) FROM trabajador
            WHERE empresa_id = $1 AND activo = true
              AND epp_vigente_hasta BETWEEN current_date AND current_date + 30)::int AS epp_por_vencer`,
      [empresaId]
    ),
  ]);

  const datosEmpresa = empresa.rows[0] ?? {};
  const n = nomina.rows[0];
  const multasPendientes = multas.rows[0].total;

  res.json({
    empresa: {
      razon_social: datosEmpresa.razon_social ?? datosEmpresa.nombre ?? null,
      nombre_fantasia: datosEmpresa.nombre_fantasia ?? null,
    },
    contadores: {
      por_estado: Object.fromEntries(porEstado.rows.map((r) => [r.estado, r.total])),
      multas_pendientes: multasPendientes,
      trabajadores_activos: n.trabajadores_activos,
      vehiculos_activos: n.vehiculos_activos,
    },
    alertas: {
      contratos_por_vencer: n.contratos_por_vencer,
      epp_por_vencer: n.epp_por_vencer,
      multas_pendientes: multasPendientes,
    },
  });
}

const FUE_APROBADO = `EXISTS (
  SELECT 1 FROM historial_eventos he
  WHERE he.permiso_id = p.id AND he.tipo_evento = 'CAMBIO_ESTADO_PERMISO'
    AND he.detalle->>'estado_nuevo' = 'APROBADO'
)`;

// GET /api/empresa/estadisticas?desde=&hasta=&agrupar=mes|semana — datos para
// los gráficos. Rango máximo de 1 año (por defecto los últimos 180 días).
async function estadisticas(req, res) {
  const empresaId = empresaDe(req, res);
  if (!empresaId) return;

  const agrupar = req.query.agrupar ?? 'mes';
  if (!['mes', 'semana'].includes(agrupar)) {
    throw errorValidacion('agrupar debe ser mes o semana');
  }
  const unidad = agrupar === 'mes' ? 'month' : 'week';
  const { desde, hasta } = rangoFechasValidado(req.query, { defectoDias: 180, maxDias: 365 });

  const [porPeriodo, porEstado, porRiesgo, multasPorPeriodo, tiempo] = await Promise.all([
    pool.query(
      `SELECT to_char(date_trunc($2::text, p.created_at AT TIME ZONE '${ZONA}'), 'YYYY-MM-DD') AS periodo,
              count(*)::int AS total,
              count(*) FILTER (WHERE ${FUE_APROBADO})::int AS aprobadas,
              count(*) FILTER (WHERE p.estado = 'RECHAZADO')::int AS rechazadas,
              count(*) FILTER (WHERE p.estado = 'FINALIZADO')::int AS finalizadas
       FROM permiso p
       WHERE p.empresa_id = $1 AND p.created_at BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY 1`,
      [empresaId, unidad, desde, hasta]
    ),
    pool.query(
      `SELECT estado, count(*)::int AS total FROM permiso
       WHERE empresa_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY estado ORDER BY total DESC`,
      [empresaId, desde, hasta]
    ),
    pool.query(
      `SELECT er.nivel, count(*)::int AS total
       FROM permiso p
       JOIN LATERAL (
         SELECT nivel FROM evaluacion_riesgo e WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
       ) er ON true
       WHERE p.empresa_id = $1 AND p.created_at BETWEEN $2 AND $3
       GROUP BY er.nivel`,
      [empresaId, desde, hasta]
    ),
    pool.query(
      `SELECT to_char(date_trunc($2::text, i.fecha AT TIME ZONE '${ZONA}'), 'YYYY-MM-DD') AS periodo,
              count(*)::int AS total
       FROM infraccion i JOIN permiso p ON p.id = i.permiso_id
       WHERE p.empresa_id = $1 AND i.fecha BETWEEN $3 AND $4
       GROUP BY 1 ORDER BY 1`,
      [empresaId, unidad, desde, hasta]
    ),
    pool.query(
      `SELECT round(avg(extract(epoch FROM (a.aprobado_at - p.created_at)) / 3600)::numeric, 2) AS horas
       FROM permiso p
       JOIN LATERAL (
         SELECT min(he.created_at) AS aprobado_at FROM historial_eventos he
         WHERE he.permiso_id = p.id AND he.tipo_evento = 'CAMBIO_ESTADO_PERMISO'
           AND he.detalle->>'estado_nuevo' = 'APROBADO'
       ) a ON a.aprobado_at IS NOT NULL
       WHERE p.empresa_id = $1 AND p.created_at BETWEEN $2 AND $3`,
      [empresaId, desde, hasta]
    ),
  ]);

  const horas = tiempo.rows[0]?.horas;

  res.json({
    rango: { desde, hasta, agrupar },
    por_periodo: porPeriodo.rows,
    por_estado: porEstado.rows,
    por_riesgo: porRiesgo.rows.map((r) => ({ nivel: NIVEL_LABEL[r.nivel] ?? r.nivel, total: r.total })),
    multas_por_periodo: multasPorPeriodo.rows,
    tiempo_promedio_aprobacion_horas: horas === null || horas === undefined ? null : Number(horas),
  });
}

module.exports = { solicitudes, multasDeSolicitud, resumen, estadisticas };
