// Rate limiting simple por IP, en memoria (sin Redis: suficiente para un
// capstone con un solo proceso Node). Usado para endpoints públicos que no
// requieren JWT (ej. canje de código de chofer) y por eso son el blanco más
// fácil de fuerza bruta.
function crearRateLimiter({ ventanaMs, maxIntentos, mensaje }) {
  const intentosPorIp = new Map();

  setInterval(() => {
    const ahora = Date.now();
    for (const [ip, registro] of intentosPorIp) {
      if (ahora - registro.desde > ventanaMs) intentosPorIp.delete(ip);
    }
  }, ventanaMs).unref();

  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    const ahora = Date.now();
    const registro = intentosPorIp.get(ip);

    if (!registro || ahora - registro.desde > ventanaMs) {
      intentosPorIp.set(ip, { desde: ahora, cuenta: 1 });
      return next();
    }

    if (registro.cuenta >= maxIntentos) {
      return res.status(429).json({ error: mensaje || 'Demasiados intentos, intenta más tarde' });
    }

    registro.cuenta += 1;
    next();
  };
}

module.exports = { crearRateLimiter };
