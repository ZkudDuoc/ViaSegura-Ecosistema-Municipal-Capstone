import api from "./api";

export function listarPendientes() {
  return api.get("/permisos").then((res) => res.data);
}

// No existe (todavía) un endpoint de "denegar/rechazar" del lado del
// Backend — solo aprobar(). Pendiente de coordinar con Joshua.
export function aprobarPermiso(id) {
  return api.patch(`/permisos/${id}/aprobar`).then((res) => res.data);
}
