// Orígenes permitidos por entorno: CORS_ORIGINS = "https://dashboard.x.cl,https://empresa.x.cl".
// Si no está definida se permite cualquier origen (desarrollo / demo).
function origenesPermitidos(env = process.env) {
  const crudo = env.CORS_ORIGINS;
  if (!crudo) return null;
  const lista = crudo
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return lista.length > 0 ? lista : null;
}

// Cabeceras propias que el navegador debe poder leer desde otro origen.
const CABECERAS_EXPUESTAS = ['X-Next-Cursor', 'X-Cache', 'Retry-After', 'Content-Disposition'];

function opcionesCors(env = process.env) {
  return { origin: origenesPermitidos(env) ?? true, exposedHeaders: CABECERAS_EXPUESTAS };
}

function opcionesSocketCors(env = process.env) {
  return { origin: origenesPermitidos(env) ?? '*' };
}

module.exports = { origenesPermitidos, opcionesCors, opcionesSocketCors };
