import api from "./api";

// `area` es un arreglo de puntos [lng, lat] que forman el polígono. El
// Backend NO cierra el anillo solo (verificado contra la base real): quien
// llama debe repetir el primer punto al final (ver cerrarPoligono en
// SolicitudScreen.js). `comuna_id` y `empresa_ejecutora_id` son UUID, no
// enteros. `tipo_actividad` es el enum "PROGRAMADA" | "EMERGENCIA".
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

// El Backend filtra automáticamente por el usuario autenticado (chofer ve
// las suyas, roles municipales ven las de su comuna) — no hace falta pasar
// ningún filtro desde el cliente.
export function listarPermisos() {
  return api.get("/permisos").then((res) => res.data);
}
