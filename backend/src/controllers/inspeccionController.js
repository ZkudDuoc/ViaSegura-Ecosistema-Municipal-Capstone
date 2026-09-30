const pool = require('../config/db');
const bitacoraService = require('../services/bitacoraService');
const { emitirEventoSolicitud } = require('../services/eventosService');

const RESULTADOS = ['CONFORME', 'NO_CONFORME', 'SUSPENDIDA'];

// POST /api/permisos/:id/inspeccion — checklist en terreno del Supervisor
// (post-escaneo QR): señalética, EPP, coincidencia de operarios y patente.
// Facultades: CONFORME "aprueba la faena" (deja constancia, no cambia el
// estado del permiso, que ya está ACTIVO); NO_CONFORME deja constancia sin
// detener el trabajo (el inspector cursa infracción aparte si corresponde);
// SUSPENDIDA detiene la obra de inmediato (estado -> SUSPENDIDO).
async function crear(req, res) {
  const { senaletica_ok, epp_ok, operarios_coinciden, patente_coincide, resultado, observaciones } = req.body;

  if (!RESULTADOS.includes(resultado)) {
    return res.status(400).json({ error: `resultado debe ser uno de: ${RESULTADOS.join(', ')}` });
  }

  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id, usuario_id, estado FROM permiso WHERE id = $1 AND comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );
  const permiso = permisoRows[0];

  if (!permiso) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const { rows } = await pool.query(
    `INSERT INTO inspeccion (permiso_id, inspector_id, senaletica_ok, epp_ok, operarios_coinciden, patente_coincide, resultado, observaciones)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, permiso_id, resultado, created_at`,
    [
      permiso.id,
      req.usuario.sub,
      Boolean(senaletica_ok),
      Boolean(epp_ok),
      Boolean(operarios_coinciden),
      Boolean(patente_coincide),
      resultado,
      observaciones || null,
    ]
  );
  const inspeccion = rows[0];

  await bitacoraService.registrarEvento({
    permisoId: permiso.id,
    comunaId: permiso.comuna_id,
    tipoEvento: 'INSPECCION_CHECKLIST',
    accion: resultado === 'SUSPENDIDA' ? 'SUSPENDER' : 'ACEPTAR',
    detalle: { inspeccion_id: inspeccion.id, resultado, observaciones: observaciones || null },
    actorId: req.usuario.sub,
  });

  let estadoPermiso = permiso.estado;
  if (resultado === 'SUSPENDIDA' && ['ACTIVO', 'ACTIVO_PENDIENTE_EVIDENCIA'].includes(permiso.estado)) {
    const { rows: suspendido } = await pool.query(
      `UPDATE permiso SET estado = 'SUSPENDIDO' WHERE id = $1 RETURNING estado`,
      [permiso.id]
    );
    estadoPermiso = suspendido[0].estado;
    emitirEventoSolicitud(req, 'solicitud:suspendida', { id: permiso.id, comuna_id: permiso.comuna_id, usuario_id: permiso.usuario_id, motivo: observaciones || null });
  }

  res.status(201).json({ ...inspeccion, estado_permiso: estadoPermiso });
}

// GET /api/permisos/:id/inspeccion — historial de checklists del permiso.
async function listar(req, res) {
  const { rows: permisoRows } = await pool.query(
    `SELECT id, comuna_id FROM permiso WHERE id = $1 AND comuna_id = $2`,
    [req.params.id, req.usuario.comuna_id]
  );
  if (!permisoRows[0]) {
    return res.status(404).json({ error: 'Permiso no encontrado' });
  }

  const { rows } = await pool.query(
    `SELECT id, inspector_id, senaletica_ok, epp_ok, operarios_coinciden, patente_coincide, resultado, observaciones, created_at
     FROM inspeccion WHERE permiso_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );

  res.json(rows);
}

module.exports = { crear, listar };
