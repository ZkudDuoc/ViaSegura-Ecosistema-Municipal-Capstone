// Emite eventos Socket.io de cambios de solicitud:
// "solicitud:nueva" | "solicitud:aprobada" | "solicitud:rechazada" |
// "solicitud:revocada" | "solicitud:suspendida" | "solicitud:en_revision" |
// "solicitud:corregida".
// Destinatarios: la comuna (dashboard del operador), el dueño, TODA la empresa
// (administradores que no la crearon) y las sesiones de código de chofer
// ligadas a ese servicio. Se envía en UN solo emit sobre la unión de salas:
// Socket.io entrega una única copia a cada socket aunque pertenezca a varias
// (el dueño está en su sala personal y en la de su empresa).
// `req` es opcional: si no hay `io` registrado (tests, o server.js no lo
// seteó), no hace nada — nunca debe romper la respuesta HTTP.
function salasDeDestino(permiso) {
  const salas = [];
  if (permiso.comuna_id) salas.push(`comuna:${permiso.comuna_id}`);
  if (permiso.usuario_id) salas.push(`usuario:${permiso.usuario_id}`);
  if (permiso.empresa_id) salas.push(`empresa:${permiso.empresa_id}`);
  if (permiso.id) salas.push(`permiso:${permiso.id}`);
  return salas;
}

function emitirEventoSolicitud(req, evento, permiso) {
  const io = req?.app?.get?.('io');
  if (!io || !permiso) return;

  const salas = salasDeDestino(permiso);
  if (salas.length === 0) return;

  io.to(salas).emit(evento, permiso);
}

module.exports = { emitirEventoSolicitud, salasDeDestino };
