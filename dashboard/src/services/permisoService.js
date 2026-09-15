import api from "./api";

export function listarPendientes() {
  return api.get("/permisos").then((res) => res.data);
}

// No existe (todavía) un endpoint de "denegar/rechazar" del lado del
// Backend — solo aprobar(). Pendiente de coordinar con Joshua.
export function aprobarPermiso(id) {
  return api.patch(`/permisos/${id}/aprobar`).then((res) => res.data);
}

// Cola de espera con prioridad (Semana 3): EMERGENCIA > menor riesgo > FIFO.
// Solo para OPERADOR_MUNICIPAL / INSPECTOR_MUNICIPAL, filtrada por la comuna
// del operador autenticado.
export function listarCola() {
  return api.get("/permisos/cola").then((res) => res.data);
}

// Revocación: siempre una acción humana de un operador municipal.
// motivo es opcional, se guarda en la bitácora del permiso.
export function revocarPermiso(id, motivo) {
  return api.patch(`/permisos/${id}/revocar`, { motivo }).then((res) => res.data);
}

// Asigna un móvil de escolta. Si el permiso estaba en cola por riesgo alto
// sin móvil (motivo_cola = RIESGO_ALTO_SIN_MOVIL), el backend lo saca de la
// cola automáticamente al asignarlo.
export function asignarMovil(id, identificadorMovil) {
  return api
    .patch(`/permisos/${id}/asignar-movil`, { identificador_movil: identificadorMovil })
    .then((res) => res.data);
}

// Bitácora append-only del permiso (historial_eventos).
export function obtenerBitacora(id) {
  return api.get(`/permisos/${id}/bitacora`).then((res) => res.data);
}
