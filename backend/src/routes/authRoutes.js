const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { crearRateLimiter } = require('../middleware/rateLimiter');
const { registrar, registrarEmpresa, login, me } = require('../controllers/authController');

const router = Router();

// Públicos (sin JWT): limitados por IP contra fuerza bruta y abuso de altas.
// El máximo se puede ajustar por entorno (RATE_LIMIT_AUTH_MAX).
const maxIntentos = Number(process.env.RATE_LIMIT_AUTH_MAX) || 10;
const limiteLogin = crearRateLimiter({
  ventanaMs: 15 * 60 * 1000,
  maxIntentos,
  mensaje: 'Demasiados intentos de inicio de sesión, espera unos minutos e intenta de nuevo',
});
const limiteRegistro = crearRateLimiter({
  ventanaMs: 60 * 60 * 1000,
  maxIntentos,
  mensaje: 'Demasiados intentos de registro, intenta de nuevo más tarde',
});

router.post('/registrar-empresa', limiteRegistro, registrarEmpresa);
router.post('/registrar', limiteRegistro, registrar);
router.post('/login', limiteLogin, login);
router.get('/me', requireAuth, me);

module.exports = router;
