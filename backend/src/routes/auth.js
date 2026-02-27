// src/routes/auth.js
'use strict';

const router = require('express').Router();
const { register, login, logout, me } = require('../controllers/authController');
const { verificarToken } = require('../middleware/auth');

router.post('/register', register);
router.post('/login',    login);
router.post('/logout',   verificarToken, logout);
router.get('/me',        verificarToken, me);

module.exports = router;
