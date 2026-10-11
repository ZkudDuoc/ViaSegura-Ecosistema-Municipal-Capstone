// Lectura de la nómina en CSV antes de enviarla al Backend. Se hace aquí y no
// en el servidor para aceptar el formato que deja Excel en Chile: separador
// ";" y fechas como 31-12-2026 o 31/12/2026 (el Backend pide 2026-12-31).

const ALIAS_COLUMNAS = {
  rut: "rut",
  nombre: "nombre",
  cargo: "cargo",
  contrato: "contrato_vigente_hasta",
  contrato_vigente_hasta: "contrato_vigente_hasta",
  epp: "epp_vigente_hasta",
  epp_vigente_hasta: "epp_vigente_hasta",
};

export const PLANTILLA_CSV =
  "rut;nombre;cargo;contrato_vigente_hasta;epp_vigente_hasta\n" +
  "12.345.678-5;Juan Pérez;Chofer;31-12-2026;30-06-2026\n";

// Si no se reconoce, la fecha se deja tal cual y el Backend la rechaza con su
// mensaje en el reporte de errores.
function normalizarFecha(texto) {
  const valor = texto.trim();
  if (!valor) return "";
  const chilena = valor.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (chilena) {
    const [, d, m, y] = chilena;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return valor;
}

// Devuelve las filas como objetos { rut, nombre, cargo, contrato_vigente_hasta,
// epp_vigente_hasta }, o lanza un Error con un mensaje para la persona.
export function leerNominaCsv(texto) {
  const lineas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lineas.length < 2) throw new Error("El archivo no trae trabajadores (solo la fila de títulos o está vacío).");

  const separador = lineas[0].includes(";") ? ";" : ",";
  const columnas = lineas[0].split(separador).map((t) => ALIAS_COLUMNAS[t.trim().toLowerCase()] ?? null);
  if (!columnas.includes("rut") || !columnas.includes("nombre")) {
    throw new Error("La primera fila debe tener los títulos rut y nombre. Descarga la plantilla para ver el formato.");
  }

  return lineas.slice(1).map((linea) => {
    const celdas = linea.split(separador).map((c) => c.trim().replace(/^"|"$/g, ""));
    const fila = {};
    columnas.forEach((campo, i) => {
      if (!campo) return;
      const valor = celdas[i] ?? "";
      fila[campo] = campo.endsWith("_hasta") ? normalizarFecha(valor) : valor;
    });
    return fila;
  });
}