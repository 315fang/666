const express = require('express');
const router = express.Router();
const EnvConfigService = require('../../services/EnvConfigService');
const { adminAuth } = require('../../middleware/adminAuth');

/**
 * 环境配置检查路由（.env文件只读检查）
 */

// 获取.env配置完整报告
router.get('/env-report', adminAuth, async (req, res) => {
    try {
        const report = EnvConfigService.getConfigReport();
        res.json({
            code: 0,
            data: report
        });
    } catch (error) {
        console.error('[EnvCheck] 获取配置报告失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取配置健康度（简化版）
router.get('/env-report/health', adminAuth, async (req, res) => {
    try {
        const report = EnvConfigService.getConfigReport();
        
        res.json({
            code: 0,
            data: {
                health: report.overallHealth,
                status: report.overallHealth >= 90 ? 'healthy' : 
                       report.overallHealth >= 70 ? 'warning' : 'critical',
                issues: report.summary.missing + report.summary.error,
                warnings: report.summary.warning,
                configured: report.summary.configured,
                total: report.summary.total,
                lastCheck: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取原始.env内容（脱敏）
router.get('/env-content', adminAuth, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '../../.env');
        
        if (!fs.existsSync(envPath)) {
            return res.status(404).json({
                code: 404,
                message: '.env文件不存在'
            });
        }
        
        const content = fs.readFileSync(envPath, 'utf8');
        const stats = fs.statSync(envPath);
        
        // 对敏感信息进行脱敏
        const sensitiveKeys = ['PASSWORD', 'SECRET', 'KEY', 'TOKEN', 'API_KEY'];
        const maskedContent = content.split('\n').map(line => {
            const isSensitive = sensitiveKeys.some(key => 
                line.toUpperCase().includes(key)
            );
            
            if (isSensitive && line.includes('=')) {
                const equalIndex = line.indexOf('=');
                const key = line.substring(0, equalIndex);
                const value = line.substring(equalIndex + 1).trim();
                
                if (value) {
                    // 保留前后几位，中间脱敏
                    if (value.length > 8) {
                        const masked = value.substring(0, 3) + '****' + value.substring(value.length - 3);
                        return `${key}=${masked}`;
                    } else {
                        return `${key}=********`;
                    }
                }
            }
            return line;
        }).join('\n');
        
        res.json({
            code: 0,
            data: {
                content: maskedContent,
                lastModified: stats.mtime,
                size: stats.size
            }
        });
    } catch (error) {
        console.error('[EnvCheck] 读取.env失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 对比.env和.env.example
router.get('/env-compare', adminAuth, async (req, res) => {
    try {
        const comparison = EnvConfigService.compareWithExample();
        res.json({
            code: 0,
            data: comparison
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 生成.env模板
router.get('/env-template', adminAuth, async (req, res) => {
    try {
        const template = EnvConfigService.generateEnvTemplate();
        res.json({
            code: 0,
            data: {
                template,
                filename: '.env.template'
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 下载.env模板文件
router.get('/env-template/download', adminAuth, async (req, res) => {
    try {
        const template = EnvConfigService.generateEnvTemplate();
        
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', 'attachment; filename=.env.template');
        res.send(template);
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取配置项详情
router.get('/env-config/:key', adminAuth, async (req, res) => {
    try {
        const { key } = req.params;
        const envData = EnvConfigService.parseEnvFile();
        
        if (envData.error) {
            return res.status(500).json({
                code: 500,
                message: envData.error
            });
        }
        
        const value = envData.configs[key];
        
        res.json({
            code: 0,
            data: {
                key,
                value: value || null,
                configured: !!value
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

module.exports = router;
