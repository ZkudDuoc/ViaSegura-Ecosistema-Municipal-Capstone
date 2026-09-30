import api from "./api";

// Todos aceptan { desde, hasta } como query params (ISO date); si se omiten,
// el Backend usa los últimos 30 días.

// Conteos del período vs. el período anterior de igual duración, por estado
// y por riesgo, tiempo promedio de aprobación, % revocadas/rechazadas,
// pánicos + tiempo de respuesta, y cumplimiento del SLA de la comuna.
export function obtenerResumen(params = {}) {
  return api.get("/reporteria/resumen", { params }).then((res) => res.data);
}

// Tabla histórica con filtros (estado, riesgo). Pasa formato:"csv" para
// descargar el archivo en vez de recibir JSON.
export function obtenerHistorico(params = {}) {
  if (params.formato === "csv") {
    return api.get("/reporteria/historico", { params, responseType: "blob" }).then((res) => res.data);
  }
  return api.get("/reporteria/historico", { params }).then((res) => res.data);
}

// Actividad (solicitudes creadas) por día de la semana x hora.
export function obtenerMapaCalor(params = {}) {
  return api.get("/reporteria/mapa-calor", { params }).then((res) => res.data);
}

// Empresas con más solicitudes y su tasa de revocadas/rechazadas.
export function obtenerRankingEmpresas(params = {}) {
  return api.get("/reporteria/ranking-empresas", { params }).then((res) => res.data);
}
