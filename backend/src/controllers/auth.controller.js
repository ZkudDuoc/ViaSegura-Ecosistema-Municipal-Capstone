const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const TOKEN_EXPIRES_IN = '8h';

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email y password son requeridos' });
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.password_hash, u.empresa_id, u.activo, r.nombre AS rol
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.email = $1`,
    [email]
  );

  const usuario = rows[0];
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const passwordValida = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordValida) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const payload = {
    sub: usuario.id,
    rol: usuario.rol,
    empresa_id: usuario.empresa_id,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      empresa_id: usuario.empresa_id,
    },
  });
}

async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, me };
