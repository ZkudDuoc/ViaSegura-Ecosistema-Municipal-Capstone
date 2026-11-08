import axios from "axios";
import { API_BASE_URL } from "../config";

// Cliente aparte para la vista del chofer: usa el token del código (sesión
// limitada a UN servicio), no la sesión de la empresa. Así ambas pueden
// convivir en el mismo navegador sin pisarse el token.
const choferApi = axios.create({ baseURL: API_BASE_URL });

const conToken = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// Público: no requiere cuenta. Devuelve { token, permiso_id }.
export function canjearCodigo(codigo) {
  return choferApi.post("/codigo-chofer/canjear", { codigo }).then((res) => res.data);
}

export function obtenerServicio(permisoId, token) {
  return choferApi.get(`/permisos/${permisoId}`, conToken(token)).then((res) => res.data);
}

export function obtenerQrServicio(permisoId, token) {
  return choferApi.get(`/permisos/${permisoId}/qr-token`, conToken(token)).then((res) => res.data);
}
// { secreto, periodo, digitos, algoritmo, servidor_ahora } para generar el QR sin conexión.
export function obtenerQrSecreto(permisoId, token) {
  return choferApi.get(`/permisos/${permisoId}/qr-secreto`, conToken(token)).then((res) => res.data);
}


export function iniciarServicio(permisoId, token, foto, posicion) {
  const ubicacion = posicion ? { lat: posicion.lat, lng: posicion.lng } : undefined;
  return choferApi
    .patch(`/permisos/${permisoId}/activar`, { foto_evidencia_url: foto, ubicacion }, conToken(token))
    .then((res) => res.data);
}

// PENDIENTE (Backend): /finalizar hoy solo acepta cuentas CHOFER/LOGISTICA,
// no la sesión de código — responde 403 hasta que se habilite.
export function finalizarServicio(permisoId, token) {
  return choferApi.patch(`/permisos/${permisoId}/finalizar`, null, conToken(token)).then((res) => res.data);
}

export function mensajeError(err) {
  return err?.response?.data?.error ?? "No se pudo conectar con el servidor";
}