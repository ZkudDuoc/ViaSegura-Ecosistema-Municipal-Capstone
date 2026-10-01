import api from "./api";

// El Backend liga el camión a la empresa del usuario, o al propio usuario
// si es persona natural — no hace falta enviar el dueño.
export function listarVehiculos() {
  return api.get("/vehiculos").then((res) => res.data);
}

export function crearVehiculo(datos) {
  return api.post("/vehiculos", datos).then((res) => res.data);
}

// PENDIENTE (Backend): PATCH /api/vehiculos/:id todavía no existe.
export function actualizarVehiculo(id, datos) {
  return api.patch(`/vehiculos/${id}`, datos).then((res) => res.data);
}

// PENDIENTE (Backend): DELETE /api/vehiculos/:id todavía no existe. Idealmente
// marca el camión como inactivo en vez de borrarlo (los permisos lo referencian).
export function darDeBajaVehiculo(id) {
  return api.delete(`/vehiculos/${id}`).then((res) => res.data);
}

// Mientras el Backend no tenga las rutas, responde 404 "Recurso no encontrado".
export function esNoDisponible(err) {
  return err?.response?.status === 404;
}