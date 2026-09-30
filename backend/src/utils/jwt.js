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

// Token firmado para el QR del permiso (Semana 5 Bloque 2): evita que el QR
// sea solo el id crudo del permiso (adivinable/copiable sin más). Expira con
// la ventana del servicio (el llamador calcula `expiresInSeconds`), no con un
// plazo fijo — el chofer lo muestra durante todo su turno.
function firmarTokenQr(permisoId, expiresInSeconds = 3600) {
  return jwt.sign({ tipo: 'QR_PERMISO', permisoId }, process.env.JWT_SECRET, { expiresIn: expiresInSeconds });
}

module.exports = { firmarToken, verificarToken, firmarTokenQr };