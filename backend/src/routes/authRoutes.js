const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { registrar, login, me } = require('../controllers/authController');

const router = Router();

router.post('/registrar', registrar);
router.post('/login', login);
router.get('/me', requireAuth, me);

module.exports = router;