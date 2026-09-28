import axios from "axios";
import { API_BASE_URL } from "../config";

const api = axios.create({ baseURL: API_BASE_URL });

let authToken = null;
let onUnauthorized = null;

export function setAuthToken(token) {
  authToken = token;
}

// El AuthContext registra acá qué hacer cuando el Backend rechaza el token.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Solo cuenta como sesión vencida si la request iba autenticada — un 401
    // del login (credenciales malas) no debe disparar un logout.
    const ibaAutenticada = Boolean(error?.config?.headers?.Authorization);
    if (error?.response?.status === 401 && ibaAutenticada && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error) {
  return error?.response?.data?.error ?? "No se pudo conectar con el servidor";
}

export default api;