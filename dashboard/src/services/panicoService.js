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
