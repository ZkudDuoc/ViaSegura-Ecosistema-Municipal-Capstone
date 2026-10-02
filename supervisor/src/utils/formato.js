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

export const ESTADO_CLASE = {
  PENDIENTE_CONFIRMACION_MUNICIPAL: "badge-pendiente",
  APROBADO: "badge-ok",
  EN_COLA_ESPERA: "badge-pendiente",
  ACTIVO: "badge-activo",
  ACTIVO_PENDIENTE_EVIDENCIA: "badge-pendiente",
  FINALIZADO: "badge-neutro",
  EXPIRADO: "badge-error",
  REVOCADO: "badge-error",
  RECHAZADO: "badge-error",
  SUSPENDIDO: "badge-error",
};

export const RESULTADO_INSPECCION_LABEL = {
  CONFORME: "Faena aprobada",
  NO_CONFORME: "No conforme (infracción)",
  SUSPENDIDA: "Obra suspendida",
};

export const RESULTADO_INSPECCION_CLASE = {
  CONFORME: "badge-ok",
  NO_CONFORME: "badge-pendiente",
  SUSPENDIDA: "badge-error",
};

export function formatearFecha(iso) {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}