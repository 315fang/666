const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');

// POST /api/login - 用户登录/注册
router.post('/login', login);

module.exports = router;
