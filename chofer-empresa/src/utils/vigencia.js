// Vigencia de contrato y EPP de un trabajador. Las fechas vienen del Backend
// como "AAAA-MM-DD" (sin hora), así que se comparan como texto de día.

export const DIAS_POR_VENCER = 30;

// "AAAA-MM-DD" de hoy en la hora local (no en UTC: a las 22:00 en Chile
// toISOString ya daría el día siguiente).
export function hoyIso(fecha = new Date()) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function sumarDias(diaIso, dias) {
  const [y, m, d] = diaIso.split("-").map(Number);
  return hoyIso(new Date(y, m - 1, d + dias));
}

// "sin_dato" | "vencido" | "por_vencer" | "vigente", respecto de `referencia`
// (por defecto hoy). Para una solicitud se usa el día en que termina el trabajo.
export function estadoVigencia(hasta, referencia = hoyIso()) {
  if (!hasta) return "sin_dato";
  if (hasta < referencia) return "vencido";
  if (hasta <= sumarDias(referencia, DIAS_POR_VENCER)) return "por_vencer";
  return "vigente";
}

export const VIGENCIA_TEXTO = {
  sin_dato: "sin fecha",
  vencido: "vencido",
  por_vencer: "por vencer",
  vigente: "vigente",
};

export const VIGENCIA_CLASE = {
  sin_dato: "badge-neutro",
  vencido: "badge-error",
  por_vencer: "badge-pendiente",
  vigente: "badge-ok",
};

// "AAAA-MM-DD" -> "31-12-2026", como se escribe en Chile.
export function formatearDia(diaIso) {
  if (!diaIso) return "";
  const [y, m, d] = diaIso.split("-");
  return `${d}-${m}-${y}`;
}