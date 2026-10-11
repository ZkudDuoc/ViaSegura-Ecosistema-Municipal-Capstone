import api from "./api";

// Panel de la empresa (Semana 6): todo lo de la empresa, no solo lo que creó el usuario.

// { empresa, contadores: { por_estado, multas_pendientes, trabajadores_activos, vehiculos_activos },
//   alertas: { contratos_por_vencer, epp_por_vencer, multas_pendientes } }
export function obtenerResumenEmpresa() {
  return api.get("/empresa/resumen").then((res) => res.data);
}

// Tabla de "Mis solicitudes". Filtros: q (patente, RUT ejecutor, id corto), desde/hasta
// (sobre la fecha de inicio del servicio), grupo (pendiente | aprobada_futura | en_curso |
// terminada | rechazada | en_revision | por_aplazar, o un estado exacto), con_multas (true|false),
// orden (asc|desc), limit (25 por defecto, máx. 100) y cursor.
// Devuelve { items, next_cursor } — ideal para scroll infinito.
export function listarSolicitudesEmpresa(params = {}) {
  return api.get("/empresa/solicitudes", { params }).then((res) => res.data);
}

export function listarMultasDeSolicitud(permisoId) {
  return api.get(`/empresa/solicitudes/${permisoId}/multas`).then((res) => res.data);
}

// Datos para los gráficos. agrupar: "mes" (defecto) | "semana". Rango máximo 1 año.
// { rango, por_periodo, por_estado, por_riesgo, multas_por_periodo, tiempo_promedio_aprobacion_horas }
export function obtenerEstadisticasEmpresa(params = {}) {
  return api.get("/empresa/estadisticas", { params }).then((res) => res.data);
}
