const express = require('express');
const router = express.Router();
const { getUserRole } = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

// GET /api/users/role - 获取用户角色信息
router.get('/users/role', authenticate, getUserRole);

module.exports = router;
