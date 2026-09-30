const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listarColaLocal, procesarColaLocal, listarAbiertas, atender } = require('../controllers/panicoController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/cola-local', requireAuth, requireRole(...ROLES_MUNICIPALES), listarColaLocal);
router.patch('/cola-local/:id/procesar', requireAuth, requireRole(...ROLES_MUNICIPALES), procesarColaLocal);
router.get('/abiertas', requireAuth, requireRole(...ROLES_MUNICIPALES), listarAbiertas);
router.patch('/:id/atender', requireAuth, requireRole(...ROLES_MUNICIPALES), atender);

module.exports = router;
