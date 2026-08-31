const { Router } = require('express');
const { login, me } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { catchAsync } = require('../middleware/catchAsync');

const router = Router();

router.post('/login', catchAsync(login));
router.get('/me', authenticate, catchAsync(me));

module.exports = router;
