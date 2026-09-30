import api from "./api";

// Para roles municipales el Backend devuelve los permisos de su comuna.
// Liviano: sin foto de evidencia (eso va en obtenerPermiso, detalle).
export function listarPermisos() {
  return api.get("/permisos").then((res) => res.data);
}

// Detalle completo: foto de evidencia, vehículo (patente + medidas),
// personal en faena, riesgo con score y línea de tiempo (bitácora).
export function obtenerPermiso(permisoId) {
  return api.get(`/permisos/${permisoId}`).then((res) => res.data);
}

// Compara la patente del camión en terreno con la del vehículo del permiso.
export function validarPatente(permisoId, patente) {
  return api.post(`/permisos/${permisoId}/validar-patente`, { patente }).then((res) => res.data);
}

// Tiempos del servicio en curso (solo permisos ya iniciados).
export function obtenerOperativo(permisoId) {
  return api.get(`/permisos/${permisoId}/operativo`).then((res) => res.data);
}

// Valida el token firmado que trae el QR (Semana 5: ya no es el id crudo del
// permiso) y devuelve el mismo detalle completo que obtenerPermiso.
export function verificarQr(token) {
  return api.get(`/permisos/qr/${encodeURIComponent(token)}`).then((res) => res.data);
}

// Checklist en terreno (post-escaneo): señalética, EPP, coincidencia de
// operarios y patente. resultado: "CONFORME" | "NO_CONFORME" | "SUSPENDIDA".
export function crearInspeccion(permisoId, datos) {
  return api.post(`/permisos/${permisoId}/inspeccion`, datos).then((res) => res.data);
}

export function listarInspecciones(permisoId) {
  return api.get(`/permisos/${permisoId}/inspeccion`).then((res) => res.data);
}

// PDF de aprobación/rechazo con sello municipal simulado.
export function obtenerDocumento(permisoId) {
  return api.get(`/permisos/${permisoId}/documento`, { responseType: "blob" }).then((res) => res.data);
}