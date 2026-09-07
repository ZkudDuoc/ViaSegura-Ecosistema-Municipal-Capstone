import api from "./api";

// PENDIENTE BACKEND: Joshua todavía no expone un endpoint de listado
// (GET /api/permisos). Este servicio ya está listo para consumirlo apenas
// exista — solo falta que el Backend lo implemente. Mientras tanto,
// OperadorPage maneja el error 404/501 mostrando un aviso en vez de romper.
export function listarPendientes() {
  return api.get("/permisos").then((res) => res.data);
}
