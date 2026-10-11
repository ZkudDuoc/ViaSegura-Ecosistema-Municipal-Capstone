const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const controller = require('../controllers/trabajadorController');

const router = express.Router();

// Solo LOGISTICA (administrador de la empresa) edita la nómina; el CHOFER
// con cuenta solo consulta.
const lee = [requireAuth, requireRole('CHOFER', 'LOGISTICA')];
const edita = [requireAuth, requireRole('LOGISTICA')];

router.get('/', ...lee, controller.listar);
router.post('/importar', ...edita, express.text({ type: ['text/csv', 'text/plain'], limit: '1mb' }), controller.importar);
router.get('/:id', ...lee, controller.obtener);
router.post('/', ...edita, controller.crear);
router.patch('/:id', ...edita, controller.actualizar);
router.delete('/:id', ...edita, controller.darDeBaja);

module.exports = router;
