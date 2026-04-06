const express = require('express');
const router = express.Router();
const boardController = require('../controllers/boardController');

router.get('/', boardController.getBoards);
router.get('/map', boardController.getBoardMap);

module.exports = router;
