const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  crear,
  listar,
  aprobar,
  activar,
  cola,
  revocar,
  asignarMovil,
  bitacora,
} = require('../controllers/permisoController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/', requireAuth, listar);
router.get('/cola', requireAuth, requireRole(...ROLES_MUNICIPALES), cola);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id/aprobar', requireAuth, requireRole(...ROLES_MUNICIPALES), aprobar);
router.patch('/:id/activar', requireAuth, requireRole('CHOFER', 'LOGISTICA'), activar);
router.patch('/:id/revocar', requireAuth, requireRole(...ROLES_MUNICIPALES), revocar);
router.patch('/:id/asignar-movil', requireAuth, requireRole(...ROLES_MUNICIPALES), asignarMovil);
router.get('/:id/bitacora', requireAuth, bitacora);

module.exports = router;
