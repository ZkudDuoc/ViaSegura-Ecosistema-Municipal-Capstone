import api from "./api";

// Para roles municipales el Backend devuelve los permisos de su comuna.
export function listarPermisos() {
  return api.get("/permisos").then((res) => res.data);
}

// Compara la patente del camión en terreno con la del vehículo del permiso.
export function validarPatente(permisoId, patente) {
  return api.post(`/permisos/${permisoId}/validar-patente`, { patente }).then((res) => res.data);
}

// Tiempos del servicio en curso (solo permisos ya iniciados).
export function obtenerOperativo(permisoId) {
  return api.get(`/permisos/${permisoId}/operativo`).then((res) => res.data);
}