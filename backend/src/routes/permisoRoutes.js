const { Router } = require('express');
const { requireAuth, requireRole, requireAuthOCodigoChofer } = require('../middleware/auth');
const {
  crear,
  listar,
  detalle,
  aprobar,
  activar,
  rechazar,
  finalizar,
  cola,
  revocar,
  asignarMovil,
  bitacora,
  validarPatente,
  operativo,
  operativos,
  generarQrToken,
  verificarQr,
  documento,
} = require('../controllers/permisoController');
const { generar: generarCodigoChofer } = require('../controllers/codigoChoferController');
const inspeccionController = require('../controllers/inspeccionController');

const router = Router();

const ROLES_MUNICIPALES = ['OPERADOR_MUNICIPAL', 'INSPECTOR_MUNICIPAL'];

router.get('/', requireAuth, listar);
router.get('/cola', requireAuth, requireRole(...ROLES_MUNICIPALES), cola);
router.get('/operativos', requireAuth, requireRole(...ROLES_MUNICIPALES), operativos);
router.get('/qr/:token', requireAuth, requireRole(...ROLES_MUNICIPALES), verificarQr);
router.post('/', requireAuth, requireRole('CHOFER', 'LOGISTICA'), crear);
router.patch('/:id/aprobar', requireAuth, requireRole(...ROLES_MUNICIPALES), aprobar);
router.patch('/:id/activar', requireAuthOCodigoChofer, activar);
router.patch('/:id/rechazar', requireAuth, requireRole(...ROLES_MUNICIPALES), rechazar);
router.patch('/:id/finalizar', requireAuth, requireRole('CHOFER', 'LOGISTICA'), finalizar);
router.patch('/:id/revocar', requireAuth, requireRole(...ROLES_MUNICIPALES), revocar);
router.patch('/:id/asignar-movil', requireAuth, requireRole(...ROLES_MUNICIPALES), asignarMovil);
router.post('/:id/validar-patente', requireAuth, requireRole(...ROLES_MUNICIPALES), validarPatente);
router.get('/:id/operativo', requireAuth, operativo);
router.get('/:id/qr-token', requireAuthOCodigoChofer, generarQrToken);
router.get('/:id/documento', requireAuth, documento);
router.get('/:id/bitacora', requireAuth, bitacora);
router.post('/:id/codigo-chofer', requireAuth, requireRole('CHOFER', 'LOGISTICA'), generarCodigoChofer);
router.post('/:id/inspeccion', requireAuth, requireRole(...ROLES_MUNICIPALES), inspeccionController.crear);
router.get('/:id/inspeccion', requireAuth, requireRole(...ROLES_MUNICIPALES), inspeccionController.listar);
router.get('/:id', requireAuthOCodigoChofer, detalle);

module.exports = router;
