const express = require('express');
const router = express.Router();
const AIAdminAgentService = require('../../services/AIAdminAgentService');
const { authenticateAdmin } = require('../../middleware/auth'); // Admin only!

/**
 * Admin Agent Command Endpoint
 * Allows admin to send natural language commands to control the system.
 */
router.post('/command', authenticateAdmin, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) {
            return res.status(400).json({ code: 400, message: 'Command is required' });
        }

        const userId = req.user ? req.user.id : 'admin';
        const result = await AIAdminAgentService.processCommand(command, userId);

        res.json({
            code: 0,
            data: result
        });
    } catch (error) {
        console.error('[AdminAgent API] Error:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
});

module.exports = router;
