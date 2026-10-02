import axios from "axios";

// Servicio de riesgo (Módulo 3, Nicolás) — solo se consume, no se modifica.
// En desarrollo se llama por el proxy de Vite (/riesgo → 127.0.0.1:8000).
// En producción, VITE_RIESGO_API_URL apunta al proxy del Backend o a Render.
const riesgoApi = axios.create({ baseURL: import.meta.env.VITE_RIESGO_API_URL ?? "/riesgo" });

// Tramos de calle reales (SECTRA) con riesgo y congestión, para pintar el mapa.
export function obtenerCallesRiesgo(comuna) {
  return riesgoApi.get("/calles-riesgo", { params: comuna ? { comuna } : {} }).then((res) => res.data);
}