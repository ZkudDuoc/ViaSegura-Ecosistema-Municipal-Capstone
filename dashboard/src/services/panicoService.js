import api from "./api";

// Último escalón de la cascada de resiliencia del pánico (WebSocket -> SMS ->
// cola local): alertas que no se pudieron confirmar en vivo y siguen
// pendientes de revisión por un operador de la comuna.
export function listarColaLocal() {
  return api.get("/panico/cola-local").then((res) => res.data);
}

// El operador marca la alerta encolada como atendida (ej. llamó al chofer).
export function procesarColaLocal(id) {
  return api.patch(`/panico/cola-local/${id}/procesar`).then((res) => res.data);
}

// Todas las alertas activas de la comuna (cualquier canal de entrega, no
// solo las que llegaron a la cola local) — Semana 5.
export function listarAbiertas() {
  return api.get("/panico/abiertas").then((res) => res.data);
}

export function atenderAlerta(id) {
  return api.patch(`/panico/${id}/atender`).then((res) => res.data);
}
