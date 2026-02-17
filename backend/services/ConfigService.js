const { SystemConfig, SystemConfigHistory, Admin } = require('../models');
const { Op } = require('sequelize');
const EventEmitter = require('events');

class ConfigService extends EventEmitter {
    constructor() {
        super();
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000;
        this.lastFetch = null;
    }
    
    /**
     * 获取配置值（优先从缓存）
     */
    async get(key, defaultValue = null) {
        // 1. 检查内存缓存
        if (this.cache.has(key)) {
            const cached = this.cache.get(key);
            if (Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.value;
            }
        }
        
        // 2. 从数据库读取
        const config = await SystemConfig.findOne({
            where: { config_key: key }
        });
        
        if (config) {
            const value = this.parseValue(config.config_value);
            this.cache.set(key, {
                value,
                timestamp: Date.now()
            });
            return value;
        }
        
        // 3. 返回默认值或环境变量
        return process.env[key] || defaultValue;
    }
    
    /**
     * 批量获取配置
     */
    async getMultiple(keys) {
        const results = {};
        for (const key of keys) {
            results[key] = await this.get(key);
        }
        return results;
    }
    
    /**
     * 获取分组配置
     */
    async getByGroup(group) {
        const configs = await SystemConfig.findAll({
            where: { config_group: group },
            order: [['config_key', 'ASC']]
        });
        
        return configs.map(c => ({
            key: c.config_key,
            value: this.parseValue(c.config_value),
            description: c.description,
            isSensitive: c.is_sensitive,
            updatedAt: c.updated_at
        }));
    }
    
    /**
     * 设置配置值（带验证和审计）
     */
    async set(key, value, adminId, reason = '') {
        // 1. 检查配置是否存在且可编辑
        const config = await SystemConfig.findOne({
            where: { config_key: key }
        });
        
        if (!config) {
            throw new Error(`配置项 ${key} 不存在`);
        }
        
        if (!config.is_editable) {
            throw new Error(`配置项 ${key} 不允许在后台修改`);
        }
        
        // 2. 验证值
        const validation = await this.validateValue(key, value, config.validation_rule);
        if (!validation.valid) {
            throw new Error(validation.message);
        }
        
        // 3. 记录旧值
        const oldValue = config.config_value;
        const newValue = this.stringifyValue(value);
        
        if (oldValue === newValue) {
            return { changed: false, message: '值未变化' };
        }
        
        // 4. 更新数据库
        await config.update({
            config_value: newValue,
            version: config.version + 1,
            updated_by: adminId
        });
        
        // 5. 记录历史
        await SystemConfigHistory.create({
            config_key: key,
            old_value: oldValue,
            new_value: newValue,
            changed_by: adminId,
            change_reason: reason
        });
        
        // 6. 更新缓存
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
        
        // 7. 触发变更事件
        this.emit('configChanged', {
            key,
            oldValue: this.parseValue(oldValue),
            newValue: value,
            changedBy: adminId
        });
        
        return {
            changed: true,
            key,
            version: config.version
        };
    }
    
    /**
     * 批量设置配置
     */
    async setMultiple(updates, adminId, reason = '') {
        const results = [];
        for (const update of updates) {
            try {
                const result = await this.set(
                    update.key, 
                    update.value, 
                    adminId, 
                    update.reason || reason
                );
                results.push({ key: update.key, success: true, result });
            } catch (error) {
                results.push({ key: update.key, success: false, error: error.message });
            }
        }
        return results;
    }
    
    /**
     * 获取配置修改历史
     */
    async getHistory(key, limit = 20) {
        return await SystemConfigHistory.findAll({
            where: { config_key: key },
            include: [{
                model: Admin,
                as: 'admin',
                attributes: ['id', 'username'],
                required: false
            }],
            order: [['changed_at', 'DESC']],
            limit
        });
    }
    
    /**
     * 刷新缓存
     */
    async refreshCache() {
        this.cache.clear();
        this.lastFetch = null;
        console.log('[ConfigService] 配置缓存已刷新');
    }
    
    /**
     * 获取所有可编辑配置（用于管理后台）
     */
    async getAllEditableConfigs() {
        const configs = await SystemConfig.findAll({
            where: { is_editable: true },
            order: [['config_group', 'ASC'], ['config_key', 'ASC']],
            include: [{
                model: Admin,
                as: 'updater',
                attributes: ['username'],
                required: false
            }]
        });
        
        // 按分组组织
        const groups = {};
        configs.forEach(config => {
            if (!groups[config.config_group]) {
                groups[config.config_group] = {
                    key: config.config_group,
                    label: this.getGroupLabel(config.config_group),
                    configs: []
                };
            }
            
            groups[config.config_group].configs.push({
                key: config.config_key,
                value: config.is_sensitive ? this.maskValue(config.config_value) : this.parseValue(config.config_value),
                rawValue: config.config_value,
                description: config.description,
                isSensitive: config.is_sensitive,
                isEditable: config.is_editable,
                version: config.version,
                updatedAt: config.updated_at,
                updatedBy: config.updater?.username || '系统',
                validationRule: config.validation_rule
            });
        });
        
        return Object.values(groups);
    }
    
    // ========== 工具方法 ==========
    
    parseValue(value) {
        if (!value) return null;
        
        // 尝试解析为JSON
        try {
            return JSON.parse(value);
        } catch (e) {
            // 不是JSON，返回字符串
            return value;
        }
    }
    
    stringifyValue(value) {
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }
    
    maskValue(value) {
        if (!value) return value;
        if (value.length <= 4) return '****';
        return value.substring(0, 2) + '****' + value.substring(value.length - 2);
    }
    
    getGroupLabel(group) {
        const labels = {
            ai: 'AI服务配置',
            business: '业务配置',
            storage: '文件存储配置',
            notification: '通知配置',
            system: '系统配置',
            monitor: '监控配置'
        };
        return labels[group] || group;
    }
    
    async validateValue(key, value, rules) {
        if (!rules) return { valid: true };
        
        try {
            const ruleObj = typeof rules === 'string' ? JSON.parse(rules) : rules;
            
            // 类型验证
            if (ruleObj.type) {
                if (ruleObj.type === 'number' && isNaN(Number(value))) {
                    return { valid: false, message: '必须是数字' };
                }
                if (ruleObj.type === 'boolean' && !['true', 'false', true, false, '0', '1', 0, 1].includes(value)) {
                    return { valid: false, message: '必须是布尔值' };
                }
                if (ruleObj.type === 'url' && !/^https?:\/\//.test(value)) {
                    return { valid: false, message: '必须是有效的URL' };
                }
            }
            
            // 范围验证
            if (ruleObj.min !== undefined && Number(value) < ruleObj.min) {
                return { valid: false, message: `最小值为 ${ruleObj.min}` };
            }
            if (ruleObj.max !== undefined && Number(value) > ruleObj.max) {
                return { valid: false, message: `最大值为 ${ruleObj.max}` };
            }
            
            // 正则验证
            if (ruleObj.pattern && !new RegExp(ruleObj.pattern).test(value)) {
                return { valid: false, message: ruleObj.patternMessage || '格式不正确' };
            }
            
            // 选项验证
            if (ruleObj.options && !ruleObj.options.includes(value)) {
                return { valid: false, message: `可选值: ${ruleObj.options.join(', ')}` };
            }
            
            return { valid: true };
        } catch (e) {
            return { valid: true }; // 验证规则解析失败时允许通过
        }
    }
}

module.exports = new ConfigService();
