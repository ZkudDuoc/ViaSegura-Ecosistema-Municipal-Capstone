// Emite eventos Socket.io de cambios de solicitud (Semana 5 Bloque 2):
// "solicitud:nueva" | "solicitud:aprobada" | "solicitud:rechazada" | "solicitud:revocada".
// Se envía a la sala de la comuna (para el dashboard del operador) y a la
// sala personal del chofer dueño (para que su vista se actualice en vivo).
// `req` es opcional: si no hay `io` registrado (tests, o server.js no lo
// seteó), no hace nada — nunca debe romper la respuesta HTTP.
function emitirEventoSolicitud(req, evento, permiso) {
  const io = req?.app?.get?.('io');
  if (!io || !permiso) return;

  if (permiso.comuna_id) {
    io.to(`comuna:${permiso.comuna_id}`).emit(evento, permiso);
  }
  if (permiso.usuario_id) {
    io.to(`usuario:${permiso.usuario_id}`).emit(evento, permiso);
  }
}

module.exports = { emitirEventoSolicitud };
