const pool = require('../config/db');
const riskService = require('./riskService');
const { fechaYHoraSantiago } = require('../utils/fechas');

const NIVEL_LABEL = { BAJO: 'Bajo', MEDIO: 'Medio', ALTO: 'Alto' };

// Evalúa el riesgo del permiso en el microservicio de Nicolás y lo registra.
// Envía fecha y HORA locales de Chile (hora_inicio activa el peso nocturno).
// Si el nivel es ALTO y el permiso aún espera aprobación, lo manda a la cola
// de espera (RIESGO_ALTO_SIN_MOVIL) hasta que se asigne un móvil de escolta.
// Lanza el error del microservicio si no responde: el llamador decide.
async function evaluarYRegistrar({ permisoId, estado, poligono, ventana_inicio, tipo_actividad }) {
  const { fecha, hora } = fechaYHoraSantiago(ventana_inicio);
  const resultado = await riskService.evaluarRiesgo({ poligono, fecha, hora_inicio: hora, tipo_actividad });
  const nivel = resultado.nivel.toUpperCase();

  await pool.query(
    `INSERT INTO evaluacion_riesgo (permiso_id, score, nivel, detalle)
     VALUES ($1, $2, $3, $4)`,
    [permisoId, resultado.risk_score, nivel, resultado]
  );

  let estadoFinal = estado;
  if (nivel === 'ALTO' && estado === 'PENDIENTE_CONFIRMACION_MUNICIPAL') {
    const { rows } = await pool.query(
      `UPDATE permiso SET estado = 'EN_COLA_ESPERA', motivo_cola = 'RIESGO_ALTO_SIN_MOVIL'
       WHERE id = $1 RETURNING estado`,
      [permisoId]
    );
    estadoFinal = rows[0].estado;
  }

  return {
    estado: estadoFinal,
    riesgo: {
      nivel: NIVEL_LABEL[nivel] ?? resultado.nivel,
      score: resultado.risk_score,
      congestion: resultado.congestion_score,
      explicacion: resultado.explicacion?.resumen ?? null,
      comuna_detectada: resultado.comuna_detectada ?? null,
      fuente_congestion: resultado.fuente_congestion ?? null,
    },
  };
}

// Marca que el permiso quedó sin evaluar para poder reintentar después
// (PATCH /permisos/:id/reevaluar-riesgo). Nunca lanza.
async function marcarRiesgoPendiente(permisoId) {
  try {
    await pool.query('UPDATE permiso SET riesgo_pendiente = true WHERE id = $1', [permisoId]);
  } catch (err) {
    console.error(`No se pudo marcar el riesgo pendiente del permiso ${permisoId}:`, err.code || err.message);
  }
}

module.exports = { evaluarYRegistrar, marcarRiesgoPendiente, NIVEL_LABEL };
