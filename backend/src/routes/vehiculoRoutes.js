const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crear, listar } = require('../controllers/vehiculoController');

const router = Router();

router.get('/', requireAuth, listar);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);

module.exports = router;
