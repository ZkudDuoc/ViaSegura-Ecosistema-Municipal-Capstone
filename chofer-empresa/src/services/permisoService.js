import api from "./api";

// `area` es un arreglo de puntos [lng, lat]; el Backend cierra el anillo.
export function crearPermiso(datos) {
  return api.post("/permisos", datos).then((res) => res.data);
}

// El Backend filtra por el usuario autenticado: el chofer solo ve las suyas.
export function listarPermisos() {
  return api.get("/permisos").then((res) => res.data);
}

export function activarPermiso(permisoId, foto_evidencia_url) {
  return api.patch(`/permisos/${permisoId}/activar`, { foto_evidencia_url }).then((res) => res.data);
}