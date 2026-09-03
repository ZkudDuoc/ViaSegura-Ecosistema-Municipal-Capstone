const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { firmarToken } = require('../utils/jwt');

async function registrar(req, res) {
  const { rol, nombre, rut, email, password, empresa_id, comuna_id } = req.body;

  if (!rol || !nombre || !rut || !email || !password) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO usuario (rol, nombre, rut, email, password_hash, empresa_id, comuna_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, rol, nombre, rut, email, empresa_id, comuna_id`,
    [rol, nombre, rut, email, password_hash, empresa_id || null, comuna_id || null]
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

module.exports = { registrar, login };