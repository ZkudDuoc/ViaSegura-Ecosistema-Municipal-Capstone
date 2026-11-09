const crypto = require('crypto');

// TOTP (RFC 6238) con HMAC-SHA256 y 8 dígitos, para el QR dinámico del chofer.
// El teléfono recibe el secreto UNA vez (con conexión) y genera los códigos
// solo, sin red; el backend verifica el mismo código al escanearse.
const PERIODO_SEGUNDOS = 30;
const DIGITOS = 8;
const ALGORITMO = 'SHA-256';
const PREFIJO_QR = 'VS1';

// `clave` es un Buffer con el secreto; `tiempoMs` es el reloj (ms desde epoch).
function generarCodigo(clave, tiempoMs = Date.now(), desfasePasos = 0) {
  const contador = Math.floor(tiempoMs / 1000 / PERIODO_SEGUNDOS) + desfasePasos;

  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));

  const hmac = crypto.createHmac('sha256', clave).update(mensaje).digest();

  // Truncado dinámico (RFC 4226 §5.3).
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const binario =
    ((hmac[desplazamiento] & 0x7f) << 24) |
    ((hmac[desplazamiento + 1] & 0xff) << 16) |
    ((hmac[desplazamiento + 2] & 0xff) << 8) |
    (hmac[desplazamiento + 3] & 0xff);

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

// Acepta el paso actual, el anterior y el siguiente (desfase de reloj entre
// el teléfono y el servidor). Comparación en tiempo constante.
function verificarCodigo(clave, codigo, tiempoMs = Date.now()) {
  if (typeof codigo !== 'string' || !/^\d{8}$/.test(codigo)) return false;

  const recibido = Buffer.from(codigo);
  let valido = false;
  for (const desfase of [-1, 0, 1]) {
    const esperado = Buffer.from(generarCodigo(clave, tiempoMs, desfase));
    // Se evalúan los tres pasos siempre, sin cortar al primero que coincide.
    if (crypto.timingSafeEqual(recibido, esperado)) valido = true;
  }
  return valido;
}

function generarSecreto() {
  return crypto.randomBytes(32).toString('base64');
}

// Contenido del QR: VS1.<permisoId>.<codigo>. Devuelve null si no es de este formato.
function parsearQr(token) {
  if (typeof token !== 'string' || !token.startsWith(`${PREFIJO_QR}.`)) return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  return { permisoId: partes[1], codigo: partes[2] };
}

module.exports = {
  PERIODO_SEGUNDOS,
  DIGITOS,
  ALGORITMO,
  PREFIJO_QR,
  generarCodigo,
  verificarCodigo,
  generarSecreto,
  parsearQr,
};
