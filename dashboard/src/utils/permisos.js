export const ESTADO_LABEL = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "Pendiente",
  APROBADO: "Aprobada",
  EN_COLA_ESPERA: "En cola",
  ACTIVO: "En operativo",
  ACTIVO_PENDIENTE_EVIDENCIA: "Activa (falta evidencia)",
  FINALIZADO: "Finalizada",
  EXPIRADO: "Expirada",
  REVOCADO: "Revocada",
  RECHAZADO: "Rechazada",
  SUSPENDIDO: "Suspendida",
};

export const ESTADO_CLASS = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "estado-pendiente",
  APROBADO: "estado-aprobado",
  EN_COLA_ESPERA: "estado-cola",
  ACTIVO: "estado-activo",
  ACTIVO_PENDIENTE_EVIDENCIA: "estado-activo",
  FINALIZADO: "estado-finalizado",
  EXPIRADO: "estado-expirado",
  REVOCADO: "estado-revocado",
  RECHAZADO: "estado-revocado",
  SUSPENDIDO: "estado-revocado",
};

export const RIESGO_CLASS = { Bajo: "riesgo-bajo", Medio: "riesgo-medio", Alto: "riesgo-alto" };

export const MOTIVO_COLA_LABEL = {
  RIESGO_ALTO_SIN_MOVIL: "Riesgo alto, falta asignar móvil de escolta",
  CONFLICTO_RESERVA: "Se cruza con otro permiso en la misma área y horario",
};

// Qué puede hacer el operador según el estado (mismas reglas que el Backend).
export const ESTADOS_APROBABLES = ["PENDIENTE_CONFIRMACION_MUNICIPAL"];
export const ESTADOS_RECHAZABLES = ["PENDIENTE_CONFIRMACION_MUNICIPAL", "EN_COLA_ESPERA"];
export const ESTADOS_REVOCABLES = ["APROBADO", "ACTIVO", "ACTIVO_PENDIENTE_EVIDENCIA"];
// La resolución en PDF existe solo si la municipalidad ya aprobó o rechazó.
export const ESTADOS_CON_DOCUMENTO = [
  "APROBADO",
  "ACTIVO",
  "ACTIVO_PENDIENTE_EVIDENCIA",
  "FINALIZADO",
  "EXPIRADO",
  "REVOCADO",
  "SUSPENDIDO",
  "RECHAZADO",
];

export function formatearFecha(iso) {
  return iso ? new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

// Código corto del permiso: el mismo que ve el chofer bajo su QR.
export function codigoCorto(id) {
  return id.slice(0, 8).toUpperCase();
}