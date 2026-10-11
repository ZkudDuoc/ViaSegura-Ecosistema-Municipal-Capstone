const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { calles, zonasRojas } = require('../controllers/riesgoController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/calles', requireAuth, requireRole(...ROLES_MUNICIPALES), calles);
router.get('/zonas-rojas', requireAuth, requireRole(...ROLES_MUNICIPALES), zonasRojas);

module.exports = router;
