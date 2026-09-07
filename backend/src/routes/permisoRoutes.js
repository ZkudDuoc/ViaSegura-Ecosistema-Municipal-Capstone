const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crear, listar, aprobar, activar } = require('../controllers/permisoController');

const router = Router();

router.get('/', requireAuth, listar);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id/aprobar', requireAuth, requireRole('OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'), aprobar);
router.patch('/:id/activar', requireAuth, requireRole('CHOFER', 'LOGISTICA'), activar);

module.exports = router;
