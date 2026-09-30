const pool = require('../config/db');

function rangoFechas(req) {
  const hasta = req.query.hasta ? new Date(req.query.hasta) : new Date();
  const desde = req.query.desde
    ? new Date(req.query.desde)
    : new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

function rangoAnterior(desde, hasta) {
  const duracionMs = hasta.getTime() - desde.getTime();
  return { desdeAnterior: new Date(desde.getTime() - duracionMs), hastaAnterior: desde };
}

function variacionPorcentual(actual, anterior) {
  if (anterior === 0) return actual === 0 ? 0 : 100;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

async function contarPermisos(comunaId, desde, hasta) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total FROM permiso WHERE comuna_id = $1 AND created_at BETWEEN $2 AND $3`,
    [comunaId, desde, hasta]
  );
  return rows[0].total;
}

// GET /api/reporteria/resumen?desde=&hasta= — conteos del período vs. el
// período anterior de igual duración, por estado y por riesgo, tiempo
// promedio de aprobación, % revocadas/rechazadas, pánicos + tiempo de
// respuesta, y cumplimiento del SLA de la comuna.
async function resumen(req, res) {
  const comunaId = req.usuario.comuna_id;
  const { desde, hasta } = rangoFechas(req);
  const { desdeAnterior, hastaAnterior } = rangoAnterior(desde, hasta);

  const [totalActual, totalAnterior, porEstado, porRiesgo, tiempoAprobacion, revocadasRechazadas, panicos, comuna, sla] =
    await Promise.all([
      contarPermisos(comunaId, desde, hasta),
      contarPermisos(comunaId, desdeAnterior, hastaAnterior),
      pool.query(
        `SELECT estado, count(*)::int AS total FROM permiso
         WHERE comuna_id = $1 AND created_at BETWEEN $2 AND $3
         GROUP BY estado`,
        [comunaId, desde, hasta]
      ),
      pool.query(
        `SELECT er.nivel, count(*)::int AS total
         FROM permiso p
         JOIN LATERAL (
           SELECT nivel FROM evaluacion_riesgo e WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
         ) er ON true
         WHERE p.comuna_id = $1 AND p.created_at BETWEEN $2 AND $3
         GROUP BY er.nivel`,
        [comunaId, desde, hasta]
      ),
      pool.query(
        `SELECT avg(extract(epoch FROM (he.created_at - p.created_at)) / 60)::numeric(10,1) AS minutos_promedio
         FROM historial_eventos he
         JOIN permiso p ON p.id = he.permiso_id
         WHERE he.tipo_evento = 'APROBACION_PERMISO' AND p.comuna_id = $1 AND p.created_at BETWEEN $2 AND $3`,
        [comunaId, desde, hasta]
      ),
      pool.query(
        `SELECT
           count(*) FILTER (WHERE estado = 'REVOCADO')::int AS revocadas,
           count(*) FILTER (WHERE estado = 'RECHAZADO')::int AS rechazadas,
           count(*)::int AS total
         FROM permiso WHERE comuna_id = $1 AND created_at BETWEEN $2 AND $3`,
        [comunaId, desde, hasta]
      ),
      pool.query(
        `SELECT
           count(*)::int AS total,
           avg(extract(epoch FROM (ap.atendido_at - ap.activado_at)) / 60) FILTER (WHERE ap.atendido_at IS NOT NULL)::numeric(10,1) AS minutos_respuesta_promedio
         FROM alerta_panico ap
         JOIN permiso p ON p.id = ap.permiso_id
         WHERE p.comuna_id = $1 AND ap.activado_at BETWEEN $2 AND $3`,
        [comunaId, desde, hasta]
      ),
      pool.query(`SELECT sla_confirmacion_min FROM comuna WHERE id = $1`, [comunaId]),
      pool.query(
        `SELECT
           count(*) FILTER (
             WHERE he.created_at IS NOT NULL
               AND extract(epoch FROM (he.created_at - p.created_at)) / 60 <= c.sla_confirmacion_min
           )::int AS dentro_sla,
           count(*)::int AS total
         FROM permiso p
         JOIN comuna c ON c.id = p.comuna_id
         LEFT JOIN LATERAL (
           SELECT created_at FROM historial_eventos he
           WHERE he.permiso_id = p.id AND he.tipo_evento = 'APROBACION_PERMISO'
           ORDER BY he.created_at ASC LIMIT 1
         ) he ON true
         WHERE p.comuna_id = $1 AND p.created_at BETWEEN $2 AND $3`,
        [comunaId, desde, hasta]
      ),
    ]);

  const rr = revocadasRechazadas.rows[0];

  res.json({
    periodo: { desde, hasta },
    total_solicitudes: { actual: totalActual, anterior: totalAnterior, variacion_pct: variacionPorcentual(totalActual, totalAnterior) },
    por_estado: Object.fromEntries(porEstado.rows.map((r) => [r.estado, r.total])),
    por_riesgo: Object.fromEntries(porRiesgo.rows.map((r) => [r.nivel, r.total])),
    tiempo_promedio_aprobacion_min: tiempoAprobacion.rows[0].minutos_promedio,
    porcentaje_revocadas: rr.total > 0 ? Math.round((rr.revocadas / rr.total) * 1000) / 10 : 0,
    porcentaje_rechazadas: rr.total > 0 ? Math.round((rr.rechazadas / rr.total) * 1000) / 10 : 0,
    panico: {
      total: panicos.rows[0].total,
      tiempo_respuesta_promedio_min: panicos.rows[0].minutos_respuesta_promedio,
    },
    sla: {
      sla_confirmacion_min: comuna.rows[0]?.sla_confirmacion_min ?? null,
      cumplimiento_pct: sla.rows[0].total > 0 ? Math.round((sla.rows[0].dentro_sla / sla.rows[0].total) * 1000) / 10 : null,
    },
  });
}

function aCsv(filas, columnas) {
  const encabezado = columnas.join(',');
  const cuerpo = filas
    .map((fila) => columnas.map((col) => `"${String(fila[col] ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return `${encabezado}\n${cuerpo}`;
}

// GET /api/reporteria/historico?desde=&hasta=&estado=&riesgo=&formato=csv
async function historico(req, res) {
  const comunaId = req.usuario.comuna_id;
  const { desde, hasta } = rangoFechas(req);
  const { estado, riesgo, formato } = req.query;

  const condiciones = ['p.comuna_id = $1', 'p.created_at BETWEEN $2 AND $3'];
  const parametros = [comunaId, desde, hasta];

  if (estado) {
    parametros.push(estado);
    condiciones.push(`p.estado = $${parametros.length}`);
  }
  if (riesgo) {
    parametros.push(riesgo.toUpperCase());
    condiciones.push(`er.nivel = $${parametros.length}`);
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.rut_ejecutor, p.nombre_empresa_ejecutora, p.tipo_actividad, p.estado,
            p.ventana_inicio, p.ventana_fin, p.created_at, er.nivel AS riesgo
     FROM permiso p
     LEFT JOIN LATERAL (
       SELECT nivel FROM evaluacion_riesgo e WHERE e.permiso_id = p.id ORDER BY evaluado_at DESC LIMIT 1
     ) er ON true
     WHERE ${condiciones.join(' AND ')}
     ORDER BY p.created_at DESC`,
    parametros
  );

  if (formato === 'csv') {
    const csv = aCsv(rows, ['id', 'rut_ejecutor', 'nombre_empresa_ejecutora', 'tipo_actividad', 'estado', 'ventana_inicio', 'ventana_fin', 'created_at', 'riesgo']);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="historico-permisos.csv"');
    return res.send(csv);
  }

  res.json(rows);
}

// GET /api/reporteria/mapa-calor — actividad (solicitudes creadas) por día
// de la semana x hora, útil para dimensionar turnos de fiscalización.
async function mapaCalor(req, res) {
  const comunaId = req.usuario.comuna_id;
  const { desde, hasta } = rangoFechas(req);

  const { rows } = await pool.query(
    `SELECT extract(dow FROM created_at)::int AS dia_semana, extract(hour FROM created_at)::int AS hora, count(*)::int AS total
     FROM permiso
     WHERE comuna_id = $1 AND created_at BETWEEN $2 AND $3
     GROUP BY dia_semana, hora
     ORDER BY dia_semana, hora`,
    [comunaId, desde, hasta]
  );

  res.json(rows);
}

// GET /api/reporteria/ranking-empresas — empresas con más solicitudes y su
// tasa de revocadas/rechazadas, para priorizar fiscalización.
async function rankingEmpresas(req, res) {
  const comunaId = req.usuario.comuna_id;
  const { desde, hasta } = rangoFechas(req);

  const { rows } = await pool.query(
    `SELECT
       coalesce(e.nombre, p.nombre_empresa_ejecutora, 'Persona natural / no informada') AS empresa,
       count(*)::int AS total_solicitudes,
       count(*) FILTER (WHERE p.estado = 'REVOCADO')::int AS revocadas,
       count(*) FILTER (WHERE p.estado = 'RECHAZADO')::int AS rechazadas
     FROM permiso p
     LEFT JOIN empresa e ON e.id = p.empresa_ejecutora_id
     WHERE p.comuna_id = $1 AND p.created_at BETWEEN $2 AND $3
     GROUP BY empresa
     ORDER BY total_solicitudes DESC`,
    [comunaId, desde, hasta]
  );

  res.json(rows);
}

module.exports = { resumen, historico, mapaCalor, rankingEmpresas };
