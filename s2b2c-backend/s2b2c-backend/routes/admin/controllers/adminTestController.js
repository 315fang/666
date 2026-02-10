const { sequelize, User, Order, Withdrawal, Refund, Product, Admin } = require('../../../models');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');

const testDB = async (req, res) => {
    const results = {
        checks: [],
        final_result: 'Pending'
    };

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        results.checks.push(`Time Range: ${today.toISOString()} - ${tomorrow.toISOString()}`);

        // FIX ATTEMPT: Use 'created_at' instead of 'createdAt' in where clause
        try {
            results.checks.push('Testing Order.sum with "created_at"...');
            const sum = await Order.sum('total_amount', {
                where: {
                    status: { [Op.in]: ['paid', 'shipped', 'completed'] },
                    created_at: { [Op.between]: [today, tomorrow] } // CHANGED THIS
                }
            });
            results.checks.push(`✅ Order Sum (Today Sales): OK (Value: ${sum})`);
        } catch (e) {
            results.checks.push(`❌ Order Sum FAILED (with created_at): ${e.message}`);
            throw e;
        }

        results.final_result = 'SUCCESS';
        res.json({
            code: 0,
            message: 'Fix Verification Completed',
            data: results
        });

    } catch (e) {
        results.final_result = 'CRITICAL FAILURE';
        res.status(500).json({
            code: -1,
            message: 'Diagnostic Failed',
            error: e.message,
            stack: e.stack,
            data: results
        });
    }
};

module.exports = {
    testDB
};
