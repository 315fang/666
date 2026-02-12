const express = require('express');
const router = express.Router();
const AIService = require('../services/AIService');
const AIUserAgentService = require('../services/AIUserAgentService');
const { authenticate } = require('../middleware/auth');

// AI Chat Endpoint for Frontend (User Agent)
router.post('/chat', authenticate, async (req, res) => {
    try {
        const { messages } = req.body;
        const userId = req.user.id;
        
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ code: 400, message: 'Invalid messages format' });
        }

        // Limit message history to last 10 to save tokens
        const recentMessages = messages.slice(-10);

        // Use the new User Agent Service instead of raw chat
        const reply = await AIUserAgentService.processMessage(recentMessages, userId);
        
        res.json({
            code: 200,
            data: {
                reply
            }
        });
    } catch (error) {
        console.error('AI Chat Route Error:', error);
        res.status(500).json({ code: 500, message: error.message });
    }
});

// Internal/Admin Review Endpoint
// In a real scenario, this might be called by other services internally, 
// but exposing it for admin testing is useful.
router.post('/review', authenticate, async (req, res) => {
    try {
        const { content, type } = req.body;
        if (!content) {
            return res.status(400).json({ code: 400, message: 'Content is required' });
        }

        const result = await AIService.reviewContent(content, type || 'general');
        res.json({
            code: 200,
            data: result
        });
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});

module.exports = router;
