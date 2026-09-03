const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crear, activar } = require('../controllers/permisoController');

const router = Router();

router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id/activar', requireAuth, requireRole('CHOFER', 'LOGISTICA'), activar);

module.exports = router;