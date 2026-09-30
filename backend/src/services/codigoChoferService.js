const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const HORAS_EXPIRACION = 24;
const TIPO_SESION = 'CODIGO_CHOFER';

// 32 caracteres hex (128 bits de entropía): no adivinable por fuerza bruta
// aunque no hubiera rate limiting.
function generarCodigoAleatorio() {
  return crypto.randomBytes(16).toString('hex');
}

// Genera un código de un solo uso ligado a un permiso específico, para que
// la empresa se lo pase a un chofer sin cuenta en el sistema.
async function generarCodigo(permisoId, creadoPor) {
  const codigo = generarCodigoAleatorio();
  const { rows } = await pool.query(
    `INSERT INTO codigo_chofer (permiso_id, codigo, expira_at, creado_por)
     VALUES ($1, $2, now() + ($3 * interval '1 hour'), $4)
     RETURNING id, codigo, expira_at`,
    [permisoId, codigo, HORAS_EXPIRACION, creadoPor]
  );
  return rows[0];
}

// Canjea el código: si es válido, lo marca usado (un solo uso) y devuelve un
// token de sesión limitada (solo lectura del servicio, pánico y evidencia).
async function canjearCodigo(codigo) {
  const { rows } = await pool.query(
    `UPDATE codigo_chofer
     SET usado = true, usado_at = now()
     WHERE codigo = $1 AND usado = false AND expira_at > now()
     RETURNING id, permiso_id`,
    [codigo]
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
