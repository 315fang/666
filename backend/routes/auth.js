const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validation');

// POST /api/login - 用户登录/注册
router.post('/login', validate(schemas.login), login);

module.exports = router;
