const { Router } = require('express');
const { listar } = require('../controllers/comunaController');

const router = Router();

// Público: se necesita antes de iniciar sesión (formulario de registro).
router.get('/', listar);

module.exports = router;
