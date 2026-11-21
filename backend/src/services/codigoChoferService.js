const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const HORAS_EXPIRACION = 24;
const TIPO_SESION = 'CODIGO_CHOFER';

// Formato corto para que el chofer lo escriba fácil: 4 letras y 2 números
// (ej. KMTR47). Sin I ni O para no confundirlas con 1 y 0. Son ~33 millones
// de combinaciones: lo protegen además el rate limiting, el uso único y que
// vence en 24 horas.
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const INTENTOS_UNICO = 5;

function generarCodigoAleatorio() {
  let codigo = '';
  for (let i = 0; i < 4; i++) codigo += LETRAS[crypto.randomInt(LETRAS.length)];
  return codigo + String(crypto.randomInt(100)).padStart(2, '0');
}

// Mayúsculas y sin espacios: el chofer puede escribirlo como quiera.
function normalizarCodigo(codigo) {
  return String(codigo ?? '').toUpperCase().replace(/\s/g, '');
}

// Genera un código de un solo uso ligado a un permiso específico, para que
// la empresa se lo pase a un chofer sin cuenta en el sistema. Si choca con
// uno ya existente (la columna es única), se reintenta con otro.
async function generarCodigo(permisoId, creadoPor) {
  for (let intento = 1; ; intento++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO codigo_chofer (permiso_id, codigo, expira_at, creado_por)
         VALUES ($1, $2, now() + ($3 * interval '1 hour'), $4)
         RETURNING id, codigo, expira_at`,
        [permisoId, generarCodigoAleatorio(), HORAS_EXPIRACION, creadoPor]
      );
      return rows[0];
    } catch (err) {
      if (err.code !== '23505' || intento >= INTENTOS_UNICO) throw err;
    }
  }
}

// Canjea el código: si es válido, lo marca usado (un solo uso) y devuelve un
// token de sesión limitada (solo lectura del servicio, pánico y evidencia).
async function canjearCodigo(codigo) {
  const { rows } = await pool.query(
    `UPDATE codigo_chofer
     SET usado = true, usado_at = now()
     WHERE codigo = $1 AND usado = false AND expira_at > now()
     RETURNING id, permiso_id`,
    [normalizarCodigo(codigo)]
  );

  if (!rows[0]) {
    return { ok: false, error: 'Código inválido, ya utilizado o expirado' };
  }

  const { permiso_id: permisoId } = rows[0];
  const token = jwt.sign(
    { tipo: TIPO_SESION, permisoId },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return { ok: true, token, permisoId };
}

module.exports = { generarCodigo, canjearCodigo, TIPO_SESION };
