const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crear, listar, actualizar, darDeBaja } = require('../controllers/vehiculoController');

const router = Router();

router.get('/', requireAuth, listar);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id', requireAuth, requireRole('LOGISTICA'), actualizar);
router.delete('/:id', requireAuth, requireRole('LOGISTICA'), darDeBaja);

module.exports = router;
