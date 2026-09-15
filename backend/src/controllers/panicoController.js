const pool = require('../config/db');
const bitacoraService = require('../services/bitacoraService');

// GET /api/panico/cola-local — alertas de pánico que no pudieron confirmarse
// ni por WebSocket ni por SMS (últimas en la cascada de resiliencia) y que
// siguen pendientes de revisión por un operador de la comuna.
async function listarColaLocal(req, res) {
  const { rows } = await pool.query(
    `SELECT id, alerta_panico_id, comuna_id, payload, intentos, created_at
     FROM panico_cola_local
     WHERE comuna_id = $1 AND procesado = false
     ORDER BY created_at ASC`,
    [req.usuario.comuna_id]
  );

  res.json(rows);
}

// PATCH /api/panico/cola-local/:id/procesar — un operador municipal marca
// la alerta encolada como atendida (la revisó manualmente, ej. llamó al chofer).
async function procesarColaLocal(req, res) {
  const { rows } = await pool.query(
    `UPDATE panico_cola_local
     SET procesado = true, procesado_por = $1, procesado_at = now()
     WHERE id = $2 AND comuna_id = $3 AND procesado = false
     RETURNING id, alerta_panico_id, procesado_at`,
    [req.usuario.sub, req.params.id, req.usuario.comuna_id]
  );

  if (!rows[0]) {
    return res.status(409).json({ error: 'La alerta no existe o ya fue procesada' });
  }

  const item = rows[0];

  await pool.query(
    `UPDATE alerta_panico SET estado = 'ATENDIDO', atendido_at = now(), resuelto_por = $1
     WHERE id = $2 AND estado = 'ACTIVA'`,
    [req.usuario.sub, item.alerta_panico_id]
  );

  await bitacoraService.registrarEvento({
    comunaId: req.usuario.comuna_id,
    tipoEvento: 'PANICO_COLA_LOCAL_PROCESADA',
    accion: 'ACEPTAR',
    detalle: { panico_cola_local_id: item.id, alerta_panico_id: item.alerta_panico_id },
    actorId: req.usuario.sub,
  });

  res.json(item);
}

module.exports = { listarColaLocal, procesarColaLocal };
