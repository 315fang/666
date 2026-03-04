/**
 * 轻量调试入口（仅管理员可用，生产安全）
 * 替代原 AIOpsService 复杂监控模块
 * 提供：错误日志读取、进程状态、近期数据库异常订单速览
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { sequelize } = require('../../models');

// ★ 读取最近 N 行错误日志（直接读文件，无 AI 分析）
router.get('/logs', async (req, res) => {
    const lines = Math.min(parseInt(req.query.lines) || 100, 500); // 最多返回500行
    const logDir = path.join(__dirname, '../../../logs');

    try {
        let logContent = [];

        // 读取日志目录
        let files = [];
        try {
            files = await fs.readdir(logDir);
        } catch {
            return res.json({ code: 0, data: { lines: [], note: '日志目录不存在（logs/），请确认 Logger 已配置输出路径' } });
        }

        // 找最新的 error 日志文件
        const errorFiles = files
            .filter(f => f.includes('error') && f.endsWith('.log'))
            .sort()
            .reverse();

        if (errorFiles.length === 0) {
            return res.json({ code: 0, data: { lines: [], note: '暂无错误日志文件' } });
        }

        const targetFile = errorFiles[0];
        const content = await fs.readFile(path.join(logDir, targetFile), 'utf8');
        const allLines = content.split('\n').filter(l => l.trim());

        // 返回最新的 N 行（倒序，最新在前）
        logContent = allLines.slice(-lines).reverse();

        res.json({
            code: 0,
            data: {
                file: targetFile,
                total_lines: allLines.length,
                showing: logContent.length,
                lines: logContent
            }
        });
    } catch (error) {
        res.status(500).json({ code: -1, message: '读取日志失败: ' + error.message });
    }
});

// ★ Node.js 进程实时状态（内存/CPU/运行时间）
router.get('/process', (req, res) => {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
        code: 0,
        data: {
            node_version: process.version,
            pid: process.pid,
            uptime_seconds: Math.floor(uptime),
            uptime_human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
            memory: {
                heap_used_mb: (mem.heapUsed / 1024 / 1024).toFixed(1),
                heap_total_mb: (mem.heapTotal / 1024 / 1024).toFixed(1),
                heap_percent: Math.round(mem.heapUsed / mem.heapTotal * 100),
                rss_mb: (mem.rss / 1024 / 1024).toFixed(1),
                external_mb: (mem.external / 1024 / 1024).toFixed(1)
            },
            os: {
                platform: os.platform(),
                free_mem_mb: (os.freemem() / 1024 / 1024).toFixed(0),
                total_mem_mb: (os.totalmem() / 1024 / 1024).toFixed(0),
                load_avg: os.loadavg().map(v => v.toFixed(2))
            }
        }
    });
});

// ★ 近期异常订单速览（30分钟内状态异常的订单）
router.get('/anomalies', async (req, res) => {
    try {
        const [pending] = await sequelize.query(`
            SELECT COUNT(*) AS count FROM Orders 
            WHERE status = 'pending' 
            AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)
        `);

        const [payFail] = await sequelize.query(`
            SELECT 
                COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid,
                COUNT(*) AS total
            FROM Orders
            WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
        `);

        const [bigCommissions] = await sequelize.query(`
            SELECT id, user_id, amount, type, created_at 
            FROM CommissionLogs
            WHERE amount > 5000 
            AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
            ORDER BY amount DESC
            LIMIT 10
        `);

        const payRate = payFail[0]?.total > 0
            ? Math.round(payFail[0].paid / payFail[0].total * 100)
            : 100;

        const issues = [];
        if (pending[0]?.count > 10) issues.push(`⚠️ 有 ${pending[0].count} 个订单超2小时未支付`);
        if (payRate < 60 && payFail[0]?.total > 5) issues.push(`🚨 近1小时支付成功率仅 ${payRate}%（${payFail[0].paid}/${payFail[0].total}）`);
        if (bigCommissions.length > 0) issues.push(`💰 近24小时有 ${bigCommissions.length} 笔佣金超过5000元，请人工核查`);

        res.json({
            code: 0,
            data: {
                status: issues.length === 0 ? 'normal' : 'warning',
                issues,
                stats: {
                    long_pending_orders: pending[0]?.count || 0,
                    recent_pay_rate_percent: payRate,
                    recent_payments: payFail[0]?.total || 0,
                    big_commissions: bigCommissions
                }
            }
        });
    } catch (error) {
        res.status(500).json({ code: -1, message: '查询失败: ' + error.message });
    }
});

// ★ 数据库连接测试
router.get('/db-ping', async (req, res) => {
    const start = Date.now();
    try {
        await sequelize.authenticate();
        res.json({ code: 0, data: { ok: true, latency_ms: Date.now() - start } });
    } catch (error) {
        res.json({ code: -1, data: { ok: false, error: error.message } });
    }
});

module.exports = router;
