const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { validateLogin } = require('../middleware/validate');

// POST /api/login - 用户登录/注册
router.post('/login', validateLogin, login);

module.exports = router;
