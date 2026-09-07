import { io } from "socket.io-client";
import { SOCKET_URL } from "../config";

// Contrato acordado con el Backend (Joshua) para el canal de pánico:
//   cliente emite "panico:enviar"     -> { usuarioId, nombre, ubicacion: { lat, lng }, timestamp }
//   servidor emite "panico:confirmado" -> { recibidoEn }
//   servidor emite "panico:error"      -> { error }
// NOTA: al día de esta implementación el servidor solo acepta la conexión
// (no responde estos eventos todavía) — falta que Joshua agregue el listener
// en el servidor Socket.io del Backend Core.

let socket = null;

export function connectPanicoSocket(token) {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
  });
  return socket;
}

export function emitPanico({ usuarioId, nombre, ubicacion }) {
  if (!socket) return;
  socket.emit("panico:enviar", {
    usuarioId,
    nombre,
    ubicacion,
    timestamp: new Date().toISOString(),
  });
}

export function disconnectPanicoSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getPanicoSocket() {
  return socket;
}
