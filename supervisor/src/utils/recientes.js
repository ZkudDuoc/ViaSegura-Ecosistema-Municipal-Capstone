// Últimos permisos revisados por el supervisor, para volver a ellos sin
// escanear de nuevo (ej. después de registrar una multa). Duran un turno.
const CLAVE = "viasegura_supervisor_recientes";
const MAXIMO = 5;
const DURACION_MS = 12 * 60 * 60 * 1000;

export function leerRecientes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return lista.filter((r) => Date.now() - r.revisadoEn < DURACION_MS);
  } catch {
    return [];
  }
}

export function guardarReciente({ id, rut, empresa }) {
  try {
    const lista = leerRecientes().filter((r) => r.id !== id);
    lista.unshift({ id, rut, empresa, revisadoEn: Date.now() });
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)));
  } catch {
    // Sin storage disponible: simplemente no se recuerdan.
  }
}