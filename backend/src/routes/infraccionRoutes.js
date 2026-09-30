const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { crear, listar } = require('../controllers/infraccionController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/', requireAuth, requireRole(...ROLES_MUNICIPALES), listar);
router.post('/', requireAuth, requireRole(...ROLES_MUNICIPALES), crear);

module.exports = router;
