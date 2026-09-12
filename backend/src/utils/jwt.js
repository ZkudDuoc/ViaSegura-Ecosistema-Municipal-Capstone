const jwt = require('jsonwebtoken');

function firmarToken(usuario) {
  const payload = {
    sub: usuario.id,
    rol: usuario.rol,
    empresa_id: usuario.empresa_id,
    comuna_id: usuario.comuna_id,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '8h',
  });
}

function verificarToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { firmarToken, verificarToken };