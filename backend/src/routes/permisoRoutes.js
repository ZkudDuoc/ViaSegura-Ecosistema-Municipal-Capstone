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
  validarPatente,
  operativo,
  operativos,
} = require('../controllers/permisoController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/', requireAuth, listar);
router.get('/cola', requireAuth, requireRole(...ROLES_MUNICIPALES), cola);
router.get('/operativos', requireAuth, requireRole(...ROLES_MUNICIPALES), operativos);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id/aprobar', requireAuth, requireRole(...ROLES_MUNICIPALES), aprobar);
router.patch('/:id/activar', requireAuth, requireRole('CHOFER', 'LOGISTICA'), activar);
router.patch('/:id/revocar', requireAuth, requireRole(...ROLES_MUNICIPALES), revocar);
router.patch('/:id/asignar-movil', requireAuth, requireRole(...ROLES_MUNICIPALES), asignarMovil);
router.post('/:id/validar-patente', requireAuth, requireRole(...ROLES_MUNICIPALES), validarPatente);
router.get('/:id/operativo', requireAuth, operativo);
router.get('/:id/bitacora', requireAuth, bitacora);

module.exports = router;
