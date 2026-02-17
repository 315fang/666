const { sequelize } = require('../config/database');
const AIService = require('./AIService');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class AIAdminAgentService {
    constructor() {
        this.tools = {
            check_system_logs: {
                description: '读取系统错误日志或访问日志。参数: { lines: number (默认50), type: "error" | "access" }',
                handler: this.checkSystemLogs.bind(this)
            },
            get_dashboard_stats: {
                description: '获取当前系统统计数据（订单、用户、销售额）。参数: { period: "today" | "week" | "month" }',
                handler: this.getDashboardStats.bind(this)
            },
            run_readonly_sql: {
                description: '执行只读SQL查询以检查数据库数据。禁止增删改。参数: { query: string }',
                handler: this.runReadOnlySQL.bind(this)
            },
            check_server_status: {
                description: '检查服务器CPU、内存和磁盘使用情况。无参数。',
                handler: this.checkServerStatus.bind(this)
            }
        };
    }

    async processCommand(command, userId) {
        try {
            const toolDescriptions = Object.entries(this.tools).map(([name, tool]) => {
                return `- ${name}: ${tool.description}`;
            }).join('\n');

            const systemPrompt = `
你是S2B2C商城的"超级管理员助手"。你有极高的权限，可以直接调用系统工具来协助开发人员和管理员。
你可以回答问题，或执行以下工具命令。

可用工具:
${toolDescriptions}

指令:
- 如果用户请求的信息可以通过工具获取，你必须返回JSON格式的工具调用请求。
- 格式: {"tool": "tool_name", "args": { ... }}
- 如果不需要工具，直接回复文本。
- 你的回复对象是技术人员，请保持专业、简洁、准确。

当前时间: ${new Date().toISOString()}
操作者ID: ${userId}
            `;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: command }
            ];

            const aiResponse = await AIService.chat(messages);
            
            let toolCall;
            try {
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.tool && this.tools[parsed.tool]) {
                        toolCall = parsed;
                    }
                }
            } catch (e) {
                // Ignore
            }

            if (toolCall) {
                console.log(`[AdminAgent] Executing tool: ${toolCall.tool}`, toolCall.args);
                let toolResult;
                try {
                    toolResult = await this.tools[toolCall.tool].handler(toolCall.args || {});
                } catch (err) {
                    toolResult = { error: err.message };
                }

                // Second pass: Interpret result
                messages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
                messages.push({ role: 'user', content: `工具执行结果: ${JSON.stringify(toolResult)}\n\n请根据结果回答我的问题。` });

                const finalResponse = await AIService.chat(messages);
                return {
                    type: 'action',
                    tool: toolCall.tool,
                    result: toolResult,
                    reply: finalResponse
                };
            } else {
                return {
                    type: 'text',
                    reply: aiResponse
                };
            }

        } catch (error) {
            console.error('[AdminAgent] Error:', error);
            throw new Error('助手执行命令失败: ' + error.message);
        }
    }

    async checkSystemLogs({ lines = 50, type = 'error' }) {
        const logDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(logDir)) return { error: '日志目录不存在' };
        
        const files = fs.readdirSync(logDir)
            .filter(f => f.includes(type))
            .sort()
            .reverse();

        if (files.length === 0) return { message: `没有找到 ${type} 日志文件` };

        const latestFile = path.join(logDir, files[0]);
        const content = fs.readFileSync(latestFile, 'utf8');
        const logLines = content.trim().split('\n').slice(-lines);

        return {
            file: files[0],
            lines: logLines
        };
    }

    async getDashboardStats({ period = 'today' }) {
        const [orderCount] = await sequelize.query(`SELECT count(*) as count FROM Orders WHERE status='paid'`, { type: sequelize.QueryTypes.SELECT });
        const [userCount] = await sequelize.query(`SELECT count(*) as count FROM Users`, { type: sequelize.QueryTypes.SELECT });
        const [todaySales] = await sequelize.query(`SELECT sum(total_amount) as total FROM Orders WHERE created_at > CURDATE()`, { type: sequelize.QueryTypes.SELECT });
        
        return {
            active_orders: orderCount.count,
            total_users: userCount.count,
            today_sales: todaySales.total || 0
        };
    }

    async runReadOnlySQL({ query }) {
        if (!query) throw new Error('Query is required');
        const lowerQ = query.toLowerCase().trim();
        if (!lowerQ.startsWith('select')) throw new Error('为了安全，仅允许 SELECT 查询');
        
        const results = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });
        return results.slice(0, 20);
    }

    async checkServerStatus() {
        return new Promise((resolve) => {
            const cmd = process.platform === 'win32' 
                ? 'wmic cpu get loadpercentage & wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value'
                : 'top -b -n 1 | head -n 5';

            exec(cmd, (error, stdout) => {
                if (error) resolve({ error: error.message });
                else resolve({ output: stdout.trim() });
            });
        });
    }
}

module.exports = new AIAdminAgentService();
