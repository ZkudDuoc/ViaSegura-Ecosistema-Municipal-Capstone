import api from "./api";

// El Backend liga el camión a la empresa del usuario, o al propio usuario
// si es persona natural — no hace falta enviar el dueño.
export function listarVehiculos() {
  return api.get("/vehiculos").then((res) => res.data);
}

export function crearVehiculo(datos) {
  return api.post("/vehiculos", datos).then((res) => res.data);
}

// Solo LOGISTICA. Acepta patente, alto_m, ancho_m, largo_m, peso_ton y activo.
export function actualizarVehiculo(id, datos) {
  return api.patch(`/vehiculos/${id}`, datos).then((res) => res.data);
}

// Baja lógica (activo = false): los permisos pasados referencian el camión. Solo LOGISTICA.
export function darDeBajaVehiculo(id) {
  return api.delete(`/vehiculos/${id}`).then((res) => res.data);
}

// Mientras el Backend no tenga las rutas, responde 404 "Recurso no encontrado".
export function esNoDisponible(err) {
  return err?.response?.status === 404;
}

// Búsqueda por patente y paginación opcional: con limit el siguiente cursor
// viene en el header X-Next-Cursor.
export function buscarVehiculos({ q, limit, cursor } = {}) {
  return api.get("/vehiculos", { params: { q, limit, cursor } }).then((res) => ({
    items: res.data,
    nextCursor: res.headers["x-next-cursor"] ?? null,
  }));
}
