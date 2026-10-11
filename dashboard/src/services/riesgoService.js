import api from "./api";

// Mapa de riesgo (Semana 6). El Backend hace de proxy del servicio de riesgo (con
// caché de unos minutos): el dashboard nunca llama al servicio de Python directamente.

// Calles con su riesgo/congestión. Por defecto comuna=SANTIAGO y formato=geojson
// (FeatureCollection con properties { calle_id, nombre, risk_score, nivel, congestion_score,
// color... } y metadata { leyenda }). params: { comuna, metrica: "riesgo"|"congestion", hora, bbox, formato }.
// 503 si el servicio de riesgo no responde.
export function obtenerCallesRiesgo(params = {}) {
  return api.get("/riesgo/calles", { params }).then((res) => res.data);
}

export function obtenerZonasRojas() {
  return api.get("/riesgo/zonas-rojas").then((res) => res.data);
}
