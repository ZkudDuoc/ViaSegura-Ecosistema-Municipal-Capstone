const { Router } = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { solicitudes, multasDeSolicitud, resumen, estadisticas } = require('../controllers/empresaPanelController');

const router = Router();

// Panel de la empresa: solo cuentas de empresa (LOGISTICA y CHOFER con cuenta).
const empresa = [requireAuth, requireRole('CHOFER', 'LOGISTICA')];

router.get('/resumen', ...empresa, resumen);
router.get('/estadisticas', ...empresa, estadisticas);
router.get('/solicitudes', ...empresa, solicitudes);
router.get('/solicitudes/:id/multas', ...empresa, multasDeSolicitud);

module.exports = router;
