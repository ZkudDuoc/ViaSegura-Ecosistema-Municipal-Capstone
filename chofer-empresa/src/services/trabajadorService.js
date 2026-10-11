import api from "./api";

// Nómina de trabajadores de la empresa (Semana 6). Solo LOGISTICA crea, edita,
// da de baja e importa; el CHOFER con cuenta solo consulta.
// Cada trabajador: { id, rut, nombre, cargo, contrato_vigente_hasta, epp_vigente_hasta, activo }
// (fechas "AAAA-MM-DD").

// activo: omitido/"true" = activos, "false" = dados de baja, "todos" = ambos.
// Devuelve { items, next_cursor }: pasa next_cursor como cursor para la página siguiente.
export function listarTrabajadores({ q, activo, limit, cursor } = {}) {
  return api.get("/trabajadores", { params: { q, activo, limit, cursor } }).then((res) => res.data);
}

export function obtenerTrabajador(id) {
  return api.get(`/trabajadores/${id}`).then((res) => res.data);
}

export function crearTrabajador(datos) {
  return api.post("/trabajadores", datos).then((res) => res.data);
}

export function actualizarTrabajador(id, datos) {
  return api.patch(`/trabajadores/${id}`, datos).then((res) => res.data);
}

// Baja lógica (activo = false).
export function darDeBajaTrabajador(id) {
  return api.delete(`/trabajadores/${id}`).then((res) => res.data);
}

// Importa la nómina: lista de trabajadores o el texto de un CSV
// (columnas rut, nombre, cargo, contrato_vigente_hasta, epp_vigente_hasta; separador , o ;).
// Devuelve { creados, actualizados, errores: [{ fila, motivo }] }.
export function importarTrabajadores(trabajadoresOCsv) {
  if (typeof trabajadoresOCsv === "string") {
    return api
      .post("/trabajadores/importar", trabajadoresOCsv, { headers: { "Content-Type": "text/csv" } })
      .then((res) => res.data);
  }
  return api.post("/trabajadores/importar", { trabajadores: trabajadoresOCsv }).then((res) => res.data);
}
