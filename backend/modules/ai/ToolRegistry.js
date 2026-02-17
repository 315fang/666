/**
 * ToolRegistry - AI工具注册中心
 * 
 * 统一管理所有AI工具，支持动态注册、权限控制和版本管理
 */

class ToolRegistry {
    constructor() {
        this.tools = new Map();
        this.categories = new Map();
        this.middlewares = [];
    }

    /**
     * 注册工具
     * @param {string} name - 工具名称
     * @param {Object} config - 工具配置
     * @param {Function} handler - 工具处理函数
     */
    register(name, config, handler) {
        if (this.tools.has(name)) {
            console.warn(`[ToolRegistry] 工具 ${name} 已存在，将被覆盖`);
        }

        const tool = {
            name,
            description: config.description || '',
            category: config.category || 'general',
            parameters: config.parameters || {},
            requiredRole: config.requiredRole || null, // 权限要求
            rateLimit: config.rateLimit || null, // 限流配置
            enabled: config.enabled !== false, // 默认启用
            handler,
            createdAt: new Date(),
            version: config.version || '1.0.0'
        };

        this.tools.set(name, tool);

        // 按分类组织
        if (!this.categories.has(tool.category)) {
            this.categories.set(tool.category, new Set());
        }
        this.categories.get(tool.category).add(name);

        console.log(`[ToolRegistry] 工具注册成功: ${name} (${tool.category})`);
        return tool;
    }

    /**
     * 批量注册工具
     * @param {Object} toolsConfig - 工具配置对象
     */
    registerBatch(toolsConfig) {
        for (const [name, config] of Object.entries(toolsConfig)) {
            if (config.handler && typeof config.handler === 'function') {
                this.register(name, config, config.handler);
            }
        }
    }

    /**
     * 获取工具
     * @param {string} name - 工具名称
     * @returns {Object|null}
     */
    get(name) {
        return this.tools.get(name) || null;
    }

    /**
     * 检查工具是否存在且可用
     * @param {string} name - 工具名称
     * @param {Object} context - 用户上下文
     * @returns {boolean}
     */
    isAvailable(name, context = {}) {
        const tool = this.tools.get(name);
        if (!tool || !tool.enabled) return false;

        // 检查权限
        if (tool.requiredRole && context.role) {
            // 简化版权限检查，实际应该更复杂
            const roleLevels = { guest: 0, user: 1, member: 2, leader: 3, agent: 4, admin: 10 };
            if (roleLevels[context.role] < roleLevels[tool.requiredRole]) {
                return false;
            }
        }

        return true;
    }

    /**
     * 执行工具
     * @param {string} name - 工具名称
     * @param {Object} args - 工具参数
     * @param {Object} context - 执行上下文
     * @returns {Promise<any>}
     */
    async execute(name, args = {}, context = {}) {
        const tool = this.tools.get(name);
        
        if (!tool) {
            throw new Error(`工具 ${name} 不存在`);
        }

        if (!tool.enabled) {
            throw new Error(`工具 ${name} 已禁用`);
        }

        // 执行中间件
        for (const middleware of this.middlewares) {
            await middleware(name, args, context);
        }

        // 记录执行
        console.log(`[ToolRegistry] 执行工具: ${name}`, args);

        try {
            const result = await tool.handler(args, context);
            return {
                success: true,
                data: result,
                tool: name
            };
        } catch (error) {
            console.error(`[ToolRegistry] 工具执行失败: ${name}`, error);
            return {
                success: false,
                error: error.message,
                tool: name
            };
        }
    }

    /**
     * 获取所有工具列表
     * @param {Object} filters - 过滤条件
     * @returns {Array}
     */
    list(filters = {}) {
        let tools = Array.from(this.tools.values());

        if (filters.category) {
            tools = tools.filter(t => t.category === filters.category);
        }

        if (filters.enabled !== undefined) {
            tools = tools.filter(t => t.enabled === filters.enabled);
        }

        if (filters.role) {
            tools = tools.filter(t => {
                if (!t.requiredRole) return true;
                const roleLevels = { guest: 0, user: 1, member: 2, leader: 3, agent: 4, admin: 10 };
                return roleLevels[filters.role] >= roleLevels[t.requiredRole];
            });
        }

        return tools.map(t => ({
            name: t.name,
            description: t.description,
            category: t.category,
            parameters: t.parameters,
            enabled: t.enabled,
            version: t.version
        }));
    }

    /**
     * 获取工具描述（用于AI系统提示词）
     * @param {Object} context - 用户上下文
     * @returns {string}
     */
    getToolsDescription(context = {}) {
        const tools = this.list({ enabled: true, role: context.role });
        
        return tools.map(t => {
            let desc = `- ${t.name}: ${t.description}`;
            if (Object.keys(t.parameters).length > 0) {
                const params = Object.entries(t.parameters)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');
                desc += ` Args: { ${params} }`;
            }
            return desc;
        }).join('\n');
    }

    /**
     * 启用/禁用工具
     * @param {string} name - 工具名称
     * @param {boolean} enabled - 是否启用
     */
    setEnabled(name, enabled) {
        const tool = this.tools.get(name);
        if (tool) {
            tool.enabled = enabled;
            console.log(`[ToolRegistry] 工具 ${name} 已${enabled ? '启用' : '禁用'}`);
        }
    }

    /**
     * 添加中间件
     * @param {Function} middleware - 中间件函数
     */
    use(middleware) {
        this.middlewares.push(middleware);
    }

    /**
     * 获取分类列表
     * @returns {Array}
     */
    getCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * 获取统计数据
     * @returns {Object}
     */
    getStats() {
        const tools = Array.from(this.tools.values());
        return {
            total: tools.length,
            enabled: tools.filter(t => t.enabled).length,
            disabled: tools.filter(t => !t.enabled).length,
            categories: this.categories.size
        };
    }
}

// 导出单例
module.exports = new ToolRegistry();
