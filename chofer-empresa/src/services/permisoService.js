import api from "./api";

// `area` es un arreglo de puntos [lng, lat]; el Backend cierra el anillo.
export function crearPermiso(datos) {
  return api.post("/permisos", datos).then((res) => res.data);
}

// El Backend filtra por el usuario autenticado: el chofer solo ve las suyas.
// Liviano: sin foto de evidencia (eso va en obtenerPermiso, detalle).
export function listarPermisos() {
  return api.get("/permisos").then((res) => res.data);
}

// Detalle completo: foto, vehículo, personal en faena, riesgo con score y
// línea de tiempo (bitácora).
export function obtenerPermiso(permisoId) {
  return api.get(`/permisos/${permisoId}`).then((res) => res.data);
}

export function activarPermiso(permisoId, foto_evidencia_url) {
  return api.patch(`/permisos/${permisoId}/activar`, { foto_evidencia_url }).then((res) => res.data);
}

// El chofer cierra manualmente su servicio (antes de o al cumplirse la ventana).
export function finalizarPermiso(permisoId) {
  return api.patch(`/permisos/${permisoId}/finalizar`).then((res) => res.data);
}

// Token firmado para el QR que se muestra en "servicio actual" (Semana 5).
// Reemplaza usar el id crudo del permiso como contenido del QR.
export function obtenerQrToken(permisoId) {
  return api.get(`/permisos/${permisoId}/qr-token`).then((res) => res.data);
}

// Genera un código de un solo uso para pasárselo a un chofer sin cuenta
// (ver codigoChoferService.canjearCodigoChofer). Solo el dueño del permiso.
export function generarCodigoChofer(permisoId) {
  return api.post(`/permisos/${permisoId}/codigo-chofer`).then((res) => res.data);
}

// PDF de aprobación/rechazo con sello municipal simulado y QR de
// verificación. responseType "blob" para poder descargarlo/mostrarlo.
export function obtenerDocumento(permisoId) {
  return api.get(`/permisos/${permisoId}/documento`, { responseType: "blob" }).then((res) => res.data);
}