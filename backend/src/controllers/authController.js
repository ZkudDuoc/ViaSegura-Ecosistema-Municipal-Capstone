const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { firmarToken } = require('../utils/jwt');

const ROLES_EMPRESA = ['CHOFER', 'LOGISTICA'];
const ROLES_COMUNA = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

async function registrar(req, res) {
  const { rol, nombre, rut, email, password, empresa_id, comuna_id, tipo_persona } = req.body;

  if (!rol || !nombre || !rut || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  // El esquema exige (empresa_id XOR comuna_id) según el rol (constraint
  // usuario_rol_scope): se valida acá para no dejar que reviente en Postgres.
  let empresaIdFinal = null;
  let comunaIdFinal = null;
  let tipoPersonaFinal = 'EMPRESA';

  if (ROLES_EMPRESA.includes(rol)) {
    // Modelo dual: persona natural (sin empresa registrada) o persona
    // jurídica (empresa_id obligatorio). Por defecto se asume EMPRESA para
    // no romper el flujo de registro anterior a la Semana 4.
    tipoPersonaFinal = tipo_persona === 'NATURAL' ? 'NATURAL' : 'EMPRESA';

    if (tipoPersonaFinal === 'EMPRESA') {
      if (!empresa_id) {
        return res.status(400).json({ error: `empresa_id es obligatorio para el rol ${rol} salvo que tipo_persona sea NATURAL` });
      }
      const { rows } = await pool.query('SELECT id FROM empresa WHERE id = $1', [empresa_id]);
      if (!rows[0]) {
        return res.status(400).json({ error: 'empresa_id no corresponde a una empresa registrada' });
      }
      empresaIdFinal = empresa_id;
    }
  } else if (ROLES_COMUNA.includes(rol)) {
    if (!comuna_id) {
      return res.status(400).json({ error: `comuna_id es obligatorio para el rol ${rol}` });
    }
    const { rows } = await pool.query('SELECT id FROM comuna WHERE id = $1', [comuna_id]);
    if (!rows[0]) {
      return res.status(400).json({ error: 'comuna_id no corresponde a una comuna registrada' });
    }
    comunaIdFinal = comuna_id;
  } else {
    return res.status(400).json({ error: 'rol inválido' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO usuario (rol, nombre, rut, email, password_hash, empresa_id, comuna_id, tipo_persona)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, rol, nombre, rut, email, empresa_id, comuna_id, tipo_persona`,
    [rol, nombre, rut, email, password_hash, empresaIdFinal, comunaIdFinal, tipoPersonaFinal]
  );

  const usuario = rows[0];
  const token = firmarToken(usuario);

  res.status(201).json({ usuario, token });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son obligatorios' });
  }

  const { rows } = await pool.query('SELECT * FROM usuario WHERE email = $1', [email]);
  const usuario = rows[0];

  if (!usuario || !usuario.password_hash) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordValida = await bcrypt.compare(password, usuario.password_hash);

  if (!passwordValida) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const token = firmarToken(usuario);
  delete usuario.password_hash;

  res.json({ usuario, token });
}

// GET /api/auth/me — base del guard de sesión del frontend: confirma que el
// token sigue siendo válido y devuelve el perfil actualizado del usuario
// (el JWT solo trae sub/rol/empresa_id/comuna_id, no nombre/email/rut).
async function me(req, res) {
  const { rows } = await pool.query(
    `SELECT id, rol, nombre, rut, email, empresa_id, comuna_id, tipo_persona
     FROM usuario WHERE id = $1`,
    [req.usuario.sub]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  res.json(rows[0]);
}

module.exports = { registrar, login, me };