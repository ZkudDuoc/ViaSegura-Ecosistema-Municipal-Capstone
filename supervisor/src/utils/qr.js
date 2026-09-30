// El QR en sí (Semana 5) es un token JWT firmado que se valida contra
// GET /permisos/qr/:token — no se parsea acá, solo el Backend lo verifica.
// Código corto que el chofer ve bajo su QR (primeros 8 caracteres del id),
// para cuando no se puede escanear.
export function esCodigoCorto(texto) {
  return /^[0-9a-f]{8}$/i.test(texto.trim());
}