const { verificarToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verificarToken(token);
    // Los tokens de QR y de código de chofer son de otro tipo: no sirven como
    // sesión normal (solo requireAuthOCodigoChofer acepta el de código de chofer).
    if (payload.tipo) {
      return res.status(401).json({ error: 'Token inválido para esta operación' });
    }
    req.usuario = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Rol sin permiso para esta acción' });
    }
    next();
  };
}

// Acepta un JWT normal (login con cuenta) O un token de código de chofer
// (canjeado sin cuenta, ver codigoChoferService) — la sesión limitada solo
// puede actuar sobre el permiso al que quedó ligado el código al canjearse.
// Deja `req.usuario = { rol: 'CODIGO_CHOFER', permisoId, sub: null }` en ese caso.
function requireAuthOCodigoChofer(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no provisto' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verificarToken(token);

    if (payload.tipo === 'CODIGO_CHOFER') {
      if (payload.permisoId !== req.params.id) {
        return res.status(403).json({ error: 'Este código no corresponde a este servicio' });
      }
      req.usuario = { rol: 'CODIGO_CHOFER', permisoId: payload.permisoId, sub: null, comuna_id: null };
    } else {
      req.usuario = payload;
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { requireAuth, requireRole, requireAuthOCodigoChofer };