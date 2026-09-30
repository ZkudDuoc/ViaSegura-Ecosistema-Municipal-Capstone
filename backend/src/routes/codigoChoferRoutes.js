const { Router } = require('express');
const { canjear } = require('../controllers/codigoChoferController');
const { crearRateLimiter } = require('../middleware/rateLimiter');

const router = Router();

// Público (sin JWT, se usa desde el login sin cuenta previa) — por eso lleva
// rate limiting por IP además del código largo/no adivinable y de un solo uso.
const limiteCanje = crearRateLimiter({
  ventanaMs: 15 * 60 * 1000,
  maxIntentos: 8,
  mensaje: 'Demasiados intentos de canje, espera unos minutos e intenta de nuevo',
});

router.post('/canjear', limiteCanje, canjear);

module.exports = router;
