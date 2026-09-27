// Mismo formato que genera la web Chofer/Empresa (QrPermisoModal).
const PREFIJO_QR = "VIASEGURA-PERMISO:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Devuelve el id del permiso, o null si el texto no es un QR de VíaSegura.
export function extraerIdPermiso(texto) {
  const limpio = texto.trim();
  const candidato = limpio.startsWith(PREFIJO_QR) ? limpio.slice(PREFIJO_QR.length) : limpio;
  return UUID.test(candidato) ? candidato.toLowerCase() : null;
}

// Código corto que el chofer ve bajo su QR (primeros 8 caracteres del id).
export function esCodigoCorto(texto) {
  return /^[0-9a-f]{8}$/i.test(texto.trim());
}