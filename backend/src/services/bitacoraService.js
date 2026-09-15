const pool = require('../config/db');

// Inserción explícita en la bitácora append-only (historial_eventos).
// Los cambios de estado de permiso/alerta ya quedan registrados solos vía
// trigger (ver migrations/002_logica.sql); este helper es para eventos que
// requieren actor_id/accion explícitos (revocación, asignación de móvil,
// cascada de pánico) y para exponer la bitácora por API.
async function registrarEvento({ permisoId = null, comunaId, tipoEvento, accion = null, detalle = null, actorId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO historial_eventos (permiso_id, comuna_id, tipo_evento, accion, detalle, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [permisoId, comunaId, tipoEvento, accion, detalle, actorId]
  );
  return rows[0];
}

async function listarPorPermiso(permisoId) {
  const { rows } = await pool.query(
    `SELECT id, permiso_id, comuna_id, tipo_evento, accion, detalle, actor_id, created_at
     FROM historial_eventos WHERE permiso_id = $1 ORDER BY created_at ASC`,
    [permisoId]
  );
  return rows;
}

async function listarPorComuna(comunaId, { limit = 100 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, permiso_id, comuna_id, tipo_evento, accion, detalle, actor_id, created_at
     FROM historial_eventos WHERE comuna_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [comunaId, limit]
  );
  return rows;
}

module.exports = { registrarEvento, listarPorPermiso, listarPorComuna };
