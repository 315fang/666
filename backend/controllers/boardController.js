const { getPublicBoards, getPublicBoardMap } = require('../services/BoardService');
const logger = require('../utils/logger');

/**
 * GET /api/boards
 * query: scene=home|activity|user, keys=home.hero,home.featuredProducts
 */
const getBoards = async (req, res) => {
    try {
        const { scene, keys } = req.query;
        const keyList = String(keys || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        const data = await getPublicBoards({
            scene: scene || undefined,
            keys: keyList.length ? keyList : undefined
        });
        res.json({ code: 0, data });
    } catch (error) {
        logger.error('获取榜单数据失败', { message: error.message, stack: error.stack });
        res.status(500).json({ code: -1, message: '获取榜单失败' });
    }
};

/**
 * GET /api/boards/map
 * query: scene=home|activity|user, keys=...
 */
const getBoardMap = async (req, res) => {
    try {
        const { scene, keys } = req.query;
        const keyList = String(keys || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
        const data = await getPublicBoardMap({
            scene: scene || undefined,
            keys: keyList.length ? keyList : undefined
        });
        res.json({ code: 0, data });
    } catch (error) {
        logger.error('获取榜单映射失败', { message: error.message, stack: error.stack });
        res.status(500).json({ code: -1, message: '获取榜单失败' });
    }
};

module.exports = {
    getBoards,
    getBoardMap
};
