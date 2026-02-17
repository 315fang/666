const { AIAlert, AIFixSession, sequelize } = require('../models');
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const AIService = require('./AIService');
const ConfigService = require('./ConfigService');

class AIOpsService {
    constructor() {
        this.monitors = new Map();
        this.isRunning = false;
        this.alertCounter = 0;
    }
    
    /**
     * 初始化并启动所有监控器
     */
    async initialize() {
        console.log('[AIOps] 初始化AI运维监控服务...');
        
        // 检查是否启用监控
        const enabled = await ConfigService.get('AI_MONITOR_ENABLED', true);
        if (!enabled) {
            console.log('[AIOps] AI监控已禁用');
            return;
        }
        
        // 注册监控任务
        this.registerMonitor('errorLogWatcher', {
            interval: 60000,  // 1分钟
            handler: this.watchErrorLogs.bind(this)
        });
        
        this.registerMonitor('orderAnomalyDetector', {
            interval: 300000,  // 5分钟
            handler: this.detectOrderAnomalies.bind(this)
        });
        
        this.registerMonitor('systemHealthChecker', {
            interval: 60000,  // 1分钟
            handler: this.checkSystemHealth.bind(this)
        });
        
        this.registerMonitor('databasePerformanceWatcher', {
            interval: 300000,  // 5分钟
            handler: this.watchDatabasePerformance.bind(this)
        });
        
        this.registerMonitor('commissionAnomalyDetector', {
            interval: 600000,  // 10分钟
            handler: this.detectCommissionAnomalies.bind(this)
        });
        
        // 启动监控
        this.startAllMonitors();
        console.log('[AIOps] AI运维监控服务已启动，监控器数量:', this.monitors.size);
    }
    
    /**
     * 注册监控器
     */
    registerMonitor(name, config) {
        this.monitors.set(name, {
            name,
            interval: config.interval,
            handler: config.handler,
            timer: null,
            lastRun: null
        });
    }
    
    /**
     * 启动所有监控器
     */
    startAllMonitors() {
        this.isRunning = true;
        for (const [name, monitor] of this.monitors) {
            this.startMonitor(name);
        }
    }
    
    /**
     * 启动单个监控器
     */
    startMonitor(name) {
        const monitor = this.monitors.get(name);
        if (!monitor || monitor.timer) return;
        
        // 立即执行一次
        this.runMonitor(name);
        
        // 设置定时器
        monitor.timer = setInterval(() => {
            this.runMonitor(name);
        }, monitor.interval);
    }
    
    /**
     * 执行监控任务
     */
    async runMonitor(name) {
        const monitor = this.monitors.get(name);
        if (!monitor) return;
        
        try {
            monitor.lastRun = new Date();
            await monitor.handler();
        } catch (error) {
            console.error(`[AIOps] 监控器 ${name} 执行失败:`, error.message);
        }
    }
    
    /**
     * 停止所有监控器
     */
    stopAllMonitors() {
        this.isRunning = false;
        for (const [name, monitor] of this.monitors) {
            if (monitor.timer) {
                clearInterval(monitor.timer);
                monitor.timer = null;
            }
        }
    }
    
    // ========== 监控任务实现 ==========
    
    /**
     * 监控错误日志
     */
    async watchErrorLogs() {
        const threshold = await ConfigService.get('ERROR_LOG_THRESHOLD', 10);
        
        try {
            const logDir = path.join(__dirname, '../../logs');
            
            // 检查日志目录是否存在
            try {
                await fs.access(logDir);
            } catch {
                return; // 日志目录不存在，跳过
            }
            
            // 读取最近的错误日志
            const files = await fs.readdir(logDir);
            const errorFiles = files
                .filter(f => f.includes('error') && f.endsWith('.log'))
                .sort()
                .reverse();
            
            if (errorFiles.length === 0) return;
            
            // 读取最新的错误日志文件
            const latestFile = errorFiles[0];
            const content = await fs.readFile(path.join(logDir, latestFile), 'utf8');
            const lines = content.split('\n').filter(l => l.trim());
            
            // 获取最近1分钟的错误
            const recentErrors = lines.slice(-threshold);
            
            if (recentErrors.length >= threshold) {
                // 用AI分析错误
                const analysis = await this.analyzeErrorsWithAI(recentErrors);
                
                if (analysis.isCritical) {
                    await this.createAlert({
                        level: 'CRITICAL',
                        category: 'SYSTEM_ERROR',
                        title: `检测到 ${recentErrors.length} 个错误日志`,
                        description: analysis.summary,
                        aiCause: analysis.rootCause,
                        aiImpact: analysis.impact,
                        aiConfidence: analysis.confidence,
                        aiSuggestion: analysis.suggestion,
                        autoFixable: analysis.canAutoFix,
                        fixProcedure: analysis.fixSteps
                    });
                }
            }
        } catch (error) {
            console.error('[AIOps] 错误日志监控失败:', error.message);
        }
    }
    
    /**
     * 检测订单异常
     */
    async detectOrderAnomalies() {
        const threshold = await ConfigService.get('ORDER_ANOMALY_THRESHOLD', 50);
        
        try {
            // 检查待支付订单堆积
            const [pendingResult] = await sequelize.query(`
                SELECT COUNT(*) as count 
                FROM Orders 
                WHERE status = 'pending_payment' 
                AND created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);
            
            const pendingCount = pendingResult[0]?.count || 0;
            
            if (pendingCount > threshold) {
                await this.createAlert({
                    level: 'WARNING',
                    category: 'BUSINESS_ANOMALY',
                    title: '待支付订单堆积告警',
                    description: `有 ${pendingCount} 个订单超过1小时未支付`,
                    aiCause: '可能存在支付通道异常或用户支付体验问题',
                    aiImpact: '影响转化率和用户体验',
                    aiConfidence: 0.85,
                    aiSuggestion: '检查微信支付配置和订单超时设置',
                    autoFixable: false
                });
            }
            
            // 检查支付失败率
            const [paymentResult] = await sequelize.query(`
                SELECT 
                    COUNT(CASE WHEN status = 'paid' THEN 1 END) as success,
                    COUNT(*) as total
                FROM Orders 
                WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
            `);
            
            const { success, total } = paymentResult[0] || { success: 0, total: 0 };
            
            if (total > 10) {
                const successRate = success / total;
                if (successRate < 0.5) {
                    await this.createAlert({
                        level: 'CRITICAL',
                        category: 'BUSINESS_ANOMALY',
                        title: '支付成功率异常',
                        description: `最近1小时支付成功率仅 ${(successRate * 100).toFixed(1)}%`,
                        aiCause: '支付接口可能出现问题',
                        aiImpact: '严重影响订单转化',
                        aiConfidence: 0.9,
                        aiSuggestion: '立即检查微信支付接口状态',
                        autoFixable: false
                    });
                }
            }
        } catch (error) {
            console.error('[AIOps] 订单异常检测失败:', error.message);
        }
    }
    
    /**
     * 检查系统健康
     */
    async checkSystemHealth() {
        try {
            // 获取系统资源使用情况
            let cpuUsage = 0;
            let memoryUsage = 0;
            
            if (process.platform === 'linux') {
                try {
                    const { stdout } = await execPromise('top -bn1 | grep "Cpu(s)"');
                    const match = stdout.match(/(\d+\.?\d*)\s*%?us/);
                    if (match) cpuUsage = parseFloat(match[1]);
                } catch (e) {}
            }
            
            // Node.js 内存使用
            const used = process.memoryUsage();
            memoryUsage = Math.round((used.heapUsed / used.heapTotal) * 100);
            
            // 检查是否超过阈值
            if (cpuUsage > 90) {
                await this.createAlert({
                    level: 'WARNING',
                    category: 'PERFORMANCE',
                    title: 'CPU使用率过高',
                    description: `当前CPU使用率 ${cpuUsage}%`,
                    aiSuggestion: '检查是否有耗时操作或考虑扩容',
                    autoFixable: false
                });
            }
            
            if (memoryUsage > 85) {
                await this.createAlert({
                    level: 'WARNING',
                    category: 'PERFORMANCE',
                    title: '内存使用率过高',
                    description: `当前内存使用率 ${memoryUsage}%`,
                    aiSuggestion: '检查内存泄漏或考虑重启服务',
                    autoFixable: true,
                    fixProcedure: JSON.stringify([{
                        step: 1,
                        action: '建议重启服务释放内存',
                        type: 'notification'
                    }])
                });
            }
        } catch (error) {
            console.error('[AIOps] 系统健康检查失败:', error.message);
        }
    }
    
    /**
     * 监控数据库性能
     */
    async watchDatabasePerformance() {
        try {
            const slowQueryThreshold = await ConfigService.get('PERFORMANCE_SLOW_QUERY_MS', 1000);
            
            // 检查是否有慢查询
            const [slowQueries] = await sequelize.query(`
                SELECT * FROM performance_schema.events_statements_summary_by_digest 
                WHERE AVG_TIMER_WAIT > ${slowQueryThreshold * 1000000}
                ORDER BY COUNT_STAR DESC
                LIMIT 5
            `).catch(() => [[], []]);
            
            if (slowQueries && slowQueries.length > 0) {
                const analysis = await AIService.chat([{
                    role: 'user',
                    content: `分析以下慢查询并提供优化建议：${JSON.stringify(slowQueries)}`
                }]);
                
                await this.createAlert({
                    level: 'WARNING',
                    category: 'PERFORMANCE',
                    title: `检测到 ${slowQueries.length} 个慢查询`,
                    description: '数据库存在性能问题',
                    aiCause: analysis,
                    aiConfidence: 0.8,
                    aiSuggestion: '考虑添加索引或优化查询语句',
                    autoFixable: false
                });
            }
        } catch (error) {
            // performance_schema可能不可用，忽略错误
        }
    }
    
    /**
     * 检测佣金异常
     */
    async detectCommissionAnomalies() {
        try {
            // 检查是否有异常的佣金记录
            const [anomalies] = await sequelize.query(`
                SELECT COUNT(*) as count
                FROM CommissionLogs
                WHERE amount > 10000
                AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
            `);
            
            if (anomalies[0]?.count > 0) {
                await this.createAlert({
                    level: 'WARNING',
                    category: 'BUSINESS_ANOMALY',
                    title: '异常高额佣金告警',
                    description: `检测到 ${anomalies[0].count} 笔超过10000元的佣金`,
                    aiCause: '可能存在佣金计算错误或恶意刷单',
                    aiImpact: '财务风险和平台损失',
                    aiConfidence: 0.75,
                    aiSuggestion: '人工审核这些佣金记录',
                    autoFixable: false
                });
            }
        } catch (error) {
            console.error('[AIOps] 佣金异常检测失败:', error.message);
        }
    }
    
    // ========== AI分析 ==========
    
    /**
     * 使用AI分析错误
     */
    async analyzeErrorsWithAI(errors) {
        try {
            const prompt = `分析以下错误日志并返回JSON格式结果：
${errors.slice(0, 5).join('\n')}

请返回：
{
  "summary": "错误摘要",
  "rootCause": "根本原因",
  "impact": "影响范围",
  "isCritical": true/false,
  "confidence": 0.0-1.0,
  "canAutoFix": true/false,
  "suggestion": "修复建议",
  "fixSteps": [{"step": 1, "action": "步骤描述"}]
}`;

            const response = await AIService.chat([{
                role: 'user',
                content: prompt
            }]);
            
            // 尝试解析JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            return {
                summary: response.substring(0, 200),
                rootCause: '未知',
                impact: '待评估',
                isCritical: false,
                confidence: 0.5,
                canAutoFix: false,
                suggestion: '请人工检查',
                fixSteps: []
            };
        } catch (error) {
            return {
                summary: 'AI分析失败',
                isCritical: false,
                confidence: 0
            };
        }
    }
    
    // ========== 告警管理 ==========
    
    /**
     * 创建告警
     */
    async createAlert(data) {
        // 生成告警编码
        this.alertCounter++;
        const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const alertCode = `ERR-${date}-${String(this.alertCounter).padStart(3, '0')}`;
        
        // 检查是否已存在相同的活跃告警
        const existing = await AIAlert.findOne({
            where: {
                title: data.title,
                status: 'ACTIVE',
                created_at: {
                    [Op.gt]: new Date(Date.now() - 3600000) // 1小时内
                }
            }
        });
        
        if (existing) {
            // 更新现有告警
            await existing.update({
                description: data.description,
                updated_at: new Date()
            });
            return existing;
        }
        
        // 创建新告警
        const alert = await AIAlert.create({
            alert_code: alertCode,
            level: data.level,
            category: data.category,
            title: data.title,
            description: data.description,
            ai_cause: data.aiCause,
            ai_impact: data.aiImpact,
            ai_confidence: data.aiConfidence,
            ai_suggestion: data.aiSuggestion,
            auto_fixable: data.autoFixable,
            fix_procedure: data.fixProcedure,
            fix_script: data.fixScript,
            status: 'ACTIVE'
        });
        
        console.log(`[AIOps] 创建告警: ${alertCode} - ${data.title}`);
        
        // 如果是紧急告警，可以考虑发送通知
        if (data.level === 'CRITICAL') {
            // 这里可以集成企业微信、钉钉等通知
            console.log(`[AIOps] 🚨 紧急告警: ${data.title}`);
        }
        
        return alert;
    }
    
    /**
     * 获取告警列表
     */
    async getAlerts(filters = {}) {
        const where = {};
        
        if (filters.status) where.status = filters.status;
        if (filters.level) where.level = filters.level;
        if (filters.category) where.category = filters.category;
        
        const alerts = await AIAlert.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: filters.limit || 50
        });
        
        return alerts;
    }
    
    /**
     * 获取告警统计
     */
    async getAlertStats() {
        const stats = await AIAlert.findAll({
            attributes: [
                'level',
                'status',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['level', 'status']
        });
        
        return stats;
    }
    
    /**
     * 获取仪表盘数据
     */
    async getDashboardData() {
        const [activeAlerts, recentAlerts, stats] = await Promise.all([
            this.getAlerts({ status: 'ACTIVE', limit: 10 }),
            this.getAlerts({ limit: 5 }),
            this.getAlertStats()
        ]);
        
        // 系统健康度
        const criticalCount = stats.find(s => s.level === 'CRITICAL' && s.status === 'ACTIVE')?.count || 0;
        const warningCount = stats.find(s => s.level === 'WARNING' && s.status === 'ACTIVE')?.count || 0;
        
        let healthScore = 100;
        healthScore -= criticalCount * 20;
        healthScore -= warningCount * 5;
        healthScore = Math.max(0, healthScore);
        
        return {
            healthScore,
            activeAlertsCount: activeAlerts.length,
            criticalCount,
            warningCount,
            activeAlerts,
            recentAlerts,
            stats
        };
    }
    
    /**
     * 诊断问题
     */
    async diagnoseProblem(alertId) {
        const alert = await AIAlert.findByPk(alertId);
        if (!alert) throw new Error('告警不存在');
        
        // 收集上下文信息
        const context = await this.gatherContext(alert);
        
        // AI深度诊断
        const diagnosis = await this.performDeepDiagnosis(alert, context);
        
        return {
            alert: alert.toJSON(),
            diagnosis,
            fixOptions: await this.generateFixOptions(alert, diagnosis)
        };
    }
    
    /**
     * 收集上下文
     */
    async gatherContext(alert) {
        const context = {
            timestamp: new Date(),
            alert: alert.toJSON(),
            recentErrors: [],
            systemMetrics: {}
        };
        
        try {
            // 获取相关错误日志
            if (alert.category === 'SYSTEM_ERROR') {
                const logDir = path.join(__dirname, '../../logs');
                const files = await fs.readdir(logDir).catch(() => []);
                const errorFiles = files.filter(f => f.includes('error')).sort().reverse();
                
                if (errorFiles.length > 0) {
                    const content = await fs.readFile(
                        path.join(logDir, errorFiles[0]), 
                        'utf8'
                    );
                    context.recentErrors = content.split('\n').slice(-20);
                }
            }
            
            // 获取系统指标
            context.systemMetrics = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform
            };
        } catch (error) {
            console.error('[AIOps] 收集上下文失败:', error.message);
        }
        
        return context;
    }
    
    /**
     * 执行深度诊断
     */
    async performDeepDiagnosis(alert, context) {
        try {
            const prompt = `作为系统运维专家，请深度诊断以下问题并提供修复方案：

告警信息：
标题: ${alert.title}
描述: ${alert.description}
类别: ${alert.category}
级别: ${alert.level}

上下文：
${JSON.stringify(context, null, 2)}

请返回JSON格式：
{
  "rootCause": "根本原因分析",
  "confidence": 0.0-1.0,
  "impact": "影响评估",
  "riskLevel": "LOW/MEDIUM/HIGH",
  "fixSteps": [
    {"step": 1, "action": "步骤描述", "command": "可选的命令", "risk": "风险等级"}
  ],
  "verifyMethod": "验证修复是否成功的方法",
  "prevention": "预防措施"
}`;

            const response = await AIService.chat([{
                role: 'user',
                content: prompt
            }]);
            
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            return {
                rootCause: 'AI诊断失败',
                confidence: 0.5,
                riskLevel: 'MEDIUM',
                fixSteps: []
            };
        } catch (error) {
            return {
                rootCause: '诊断过程出错',
                confidence: 0,
                riskLevel: 'HIGH',
                fixSteps: [],
                error: error.message
            };
        }
    }
    
    /**
     * 生成修复选项
     */
    async generateFixOptions(alert, diagnosis) {
        const options = [];
        
        // 选项1：AI自动修复（低风险）
        if (diagnosis.riskLevel === 'LOW' && alert.auto_fixable) {
            options.push({
                type: 'AUTO',
                label: 'AI自动修复',
                description: 'AI将自动执行修复步骤',
                estimatedTime: '1-2分钟',
                risk: '低',
                auto: true
            });
        }
        
        // 选项2：半自动修复
        options.push({
            type: 'SEMI_AUTO',
            label: 'AI辅助修复',
            description: 'AI提供分步指引，您确认后执行',
            estimatedTime: '3-5分钟',
            risk: diagnosis.riskLevel || '中',
            steps: diagnosis.fixSteps || []
        });
        
        // 选项3：标记为已解决
        options.push({
            type: 'MANUAL',
            label: '手动处理',
            description: '我已手动处理此问题',
            estimatedTime: '立即',
            risk: '无'
        });
        
        return options;
    }
    
    /**
     * 执行修复
     */
    async executeFix(alertId, option, adminId) {
        const alert = await AIAlert.findByPk(alertId);
        if (!alert) throw new Error('告警不存在');
        
        // 创建修复会话
        const session = await AIFixSession.create({
            alert_id: alertId,
            status: 'RUNNING',
            executed_by: adminId,
            steps_executed: JSON.stringify([])
        });
        
        try {
            const steps = option.steps || [];
            const executedSteps = [];
            
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                
                // 更新当前步骤
                await session.update({ current_step: i + 1 });
                
                // 执行步骤
                let result;
                if (step.command) {
                    // 执行命令
                    result = await this.executeCommand(step.command);
                } else {
                    result = { success: true, message: '手动步骤' };
                }
                
                executedSteps.push({
                    step: i + 1,
                    action: step.action,
                    result
                });
                
                await session.update({
                    steps_executed: JSON.stringify(executedSteps)
                });
                
                // 验证
                if (step.verify && !result.success) {
                    throw new Error(`步骤 ${i + 1} 执行失败: ${result.error}`);
                }
            }
            
            // 标记告警为已解决
            await alert.update({
                status: 'RESOLVED',
                fixed_by: option.type === 'AUTO' ? 'AI' : 'ADMIN',
                fixed_at: new Date()
            });
            
            await session.update({
                status: 'SUCCESS',
                completed_at: new Date()
            });
            
            return {
                success: true,
                sessionId: session.id,
                executedSteps
            };
            
        } catch (error) {
            await session.update({
                status: 'FAILED',
                error_message: error.message,
                completed_at: new Date()
            });
            
            throw error;
        }
    }
    
    /**
     * 执行命令（严格限制）
     */
    async executeCommand(command) {
        // 只允许安全的命令
        const allowedCommands = ['ls', 'cat', 'grep', 'ps', 'df', 'free'];
        const cmd = command.split(' ')[0];
        
        if (!allowedCommands.includes(cmd)) {
            return {
                success: false,
                error: '不允许执行此命令'
            };
        }
        
        try {
            const { stdout, stderr } = await execPromise(command, {
                timeout: 30000,
                maxBuffer: 1024 * 1024
            });
            
            return {
                success: true,
                output: stdout,
                error: stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 标记告警为已解决
     */
    async resolveAlert(alertId, adminId, resolution) {
        const alert = await AIAlert.findByPk(alertId);
        if (!alert) throw new Error('告警不存在');
        
        await alert.update({
            status: 'RESOLVED',
            fixed_by: 'ADMIN',
            fixed_at: new Date(),
            resolved_by: adminId
        });
        
        return { success: true };
    }
    
    /**
     * 忽略告警
     */
    async ignoreAlert(alertId, adminId, reason) {
        const alert = await AIAlert.findByPk(alertId);
        if (!alert) throw new Error('告警不存在');
        
        await alert.update({
            status: 'IGNORED',
            fixed_by: 'ADMIN',
            fixed_at: new Date(),
            resolved_by: adminId
        });
        
        return { success: true };
    }
}

module.exports = new AIOpsService();
