import api from "./api";

// Contrato acordado con Joshua (Backend). inspector_id y comuna_id los
// toma el Backend del token; permiso_id es opcional (fiscalización a
// camiones sin permiso).
//   POST /api/infracciones { permiso_id?, rut_infractor, descripcion, ubicacion: { lat, lng }, evidencia_url? }
//   GET  /api/infracciones -> infracciones de la comuna, más recientes primero
export function crearInfraccion(datos) {
  return api.post("/infracciones", datos).then((res) => res.data);
}

export function listarInfracciones() {
  return api.get("/infracciones").then((res) => res.data);
}

// Mientras el Backend no tenga las rutas, responde 404 "Recurso no encontrado".
export function esEndpointNoDisponible(err) {
  return err?.response?.status === 404;
}