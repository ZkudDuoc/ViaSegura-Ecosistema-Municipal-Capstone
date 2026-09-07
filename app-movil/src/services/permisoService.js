import api from "./api";

// `area` es un arreglo de puntos [lng, lat] que forman el polígono (sin
// repetir el primer punto al final — lo cierra el propio Backend/PostGIS).
export function crearPermiso({
  rut_ejecutor,
  comuna_id,
  tipo_actividad,
  area,
  ventana_inicio,
  ventana_fin,
  empresa_ejecutora_id,
  nombre_empresa_ejecutora,
  altura_estimada_m,
}) {
  return api
    .post("/permisos", {
      rut_ejecutor,
      comuna_id,
      tipo_actividad,
      area,
      ventana_inicio,
      ventana_fin,
      empresa_ejecutora_id,
      nombre_empresa_ejecutora,
      altura_estimada_m,
    })
    .then((res) => res.data);
}

export function activarPermiso(permisoId, foto_evidencia_url) {
  return api
    .patch(`/permisos/${permisoId}/activar`, { foto_evidencia_url })
    .then((res) => res.data);
}
