const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { resumen, historico, mapaCalor, rankingEmpresas } = require('../controllers/reporteriaController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/resumen', requireAuth, requireRole(...ROLES_MUNICIPALES), resumen);
router.get('/historico', requireAuth, requireRole(...ROLES_MUNICIPALES), historico);
router.get('/mapa-calor', requireAuth, requireRole(...ROLES_MUNICIPALES), mapaCalor);
router.get('/ranking-empresas', requireAuth, requireRole(...ROLES_MUNICIPALES), rankingEmpresas);

module.exports = router;
