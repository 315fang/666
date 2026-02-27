const express = require('express');
const router = express.Router();
const ConfigService = require('../../services/ConfigService');
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const { sequelize } = require('../../config/database');
const { QueryTypes } = require('sequelize');

/**
 * 系统配置管理路由（数据库存储，热更新）
 */

// 获取所有可编辑配置（按分组）
router.get('/system-configs', adminAuth, async (req, res) => {
    try {
        const configs = await ConfigService.getAllEditableConfigs();
        res.json({
            code: 0,
            data: configs
        });
    } catch (error) {
        console.error('[Config] 获取配置失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取单个配置
router.get('/system-configs/:key', adminAuth, async (req, res) => {
    try {
        const { key } = req.params;
        const value = await ConfigService.get(key);

        res.json({
            code: 0,
            data: {
                key,
                value
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 更新单个配置
router.put('/system-configs/:key', adminAuth, async (req, res) => {
    try {
        const { key } = req.params;
        const { value, reason } = req.body;
        const adminId = req.user.id;

        const result = await ConfigService.set(key, value, adminId, reason);

        res.json({
            code: 0,
            data: result,
            message: result.changed ? '配置已更新并实时生效' : '配置未变化'
        });
    } catch (error) {
        console.error('[Config] 更新配置失败:', error);
        res.status(400).json({
            code: 400,
            message: error.message
        });
    }
});

// 批量更新配置
router.post('/system-configs/batch', adminAuth, async (req, res) => {
    try {
        const { updates, reason } = req.body;
        const adminId = req.user.id;

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                code: 400,
                message: '更新列表不能为空'
            });
        }

        const results = await ConfigService.setMultiple(updates, adminId, reason);

        // 统计结果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        res.json({
            code: 0,
            data: {
                results,
                summary: {
                    total: results.length,
                    success: successCount,
                    failed: failCount
                }
            },
            message: `批量更新完成：${successCount}成功, ${failCount}失败`
        });
    } catch (error) {
        console.error('[Config] 批量更新失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取配置修改历史
router.get('/system-configs/:key/history', adminAuth, async (req, res) => {
    try {
        const { key } = req.params;
        const { limit = 20 } = req.query;

        const history = await ConfigService.getHistory(key, parseInt(limit));

        res.json({
            code: 0,
            data: history
        });
    } catch (error) {
        console.error('[Config] 获取历史失败:', error);
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 刷新配置缓存
router.post('/system-configs/refresh-cache', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        await ConfigService.refreshCache();
        res.json({
            code: 0,
            message: '配置缓存已刷新'
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

// 获取配置健康度
router.get('/system-configs/health', adminAuth, async (req, res) => {
    try {
        const { SystemConfig } = require('../../models');

        // 统计各类配置
        const stats = await SystemConfig.findAll({
            attributes: [
                'config_group',
                [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
            ],
            group: ['config_group']
        });

        // 计算健康度（简单版本）
        const totalConfigs = await SystemConfig.count();
        const editableConfigs = await SystemConfig.count({ where: { is_editable: true } });

        res.json({
            code: 0,
            data: {
                total: totalConfigs,
                editable: editableConfigs,
                groups: stats,
                healthScore: 100, // 简化版
                lastUpdated: new Date()
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: error.message
        });
    }
});

const identifierPattern = /^[A-Za-z0-9_]+$/;

const assertIdentifier = (value, label) => {
    if (!value || !identifierPattern.test(value)) {
        throw new Error(`${label}格式不正确`);
    }
    return value;
};

const getDatabaseName = async () => {
    const rows = await sequelize.query('SELECT DATABASE() AS name', { type: QueryTypes.SELECT });
    return rows[0]?.name;
};

const tableExists = async (schema, table) => {
    const rows = await sequelize.query(
        `SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = :schema AND table_name = :table`,
        { replacements: { schema, table }, type: QueryTypes.SELECT }
    );
    return rows.length > 0;
};

const getTableColumns = async (schema, table) => {
    const rows = await sequelize.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
         FROM information_schema.columns
         WHERE table_schema = :schema AND table_name = :table
         ORDER BY ORDINAL_POSITION`,
        { replacements: { schema, table }, type: QueryTypes.SELECT }
    );
    return rows.map(row => ({
        name: row.COLUMN_NAME,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === 'YES' ? '是' : '否',
        defaultValue: (row.COLUMN_DEFAULT !== null && row.COLUMN_DEFAULT !== undefined) ? row.COLUMN_DEFAULT : '',
        comment: row.COLUMN_COMMENT || ''
    }));
};

const getTableIndexes = async (schema, table) => {
    const rows = await sequelize.query(
        `SELECT INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX, COLUMN_NAME
         FROM information_schema.statistics
         WHERE table_schema = :schema AND table_name = :table
         ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        { replacements: { schema, table }, type: QueryTypes.SELECT }
    );
    const map = new Map();
    rows.forEach(row => {
        if (!map.has(row.INDEX_NAME)) {
            map.set(row.INDEX_NAME, {
                name: row.INDEX_NAME,
                unique: row.NON_UNIQUE === 0,
                type: row.INDEX_TYPE,
                columns: [],
                primary: row.INDEX_NAME === 'PRIMARY'
            });
        }
        map.get(row.INDEX_NAME).columns.push(row.COLUMN_NAME);
    });
    return Array.from(map.values()).sort((a, b) => {
        if (a.primary && !b.primary) return -1;
        if (!a.primary && b.primary) return 1;
        return a.name.localeCompare(b.name);
    });
};

router.get('/db-indexes/tables', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const schema = await getDatabaseName();
        const rows = await sequelize.query(
            `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, TABLE_COMMENT
             FROM information_schema.tables
             WHERE table_schema = :schema AND table_type = 'BASE TABLE'
             ORDER BY TABLE_NAME`,
            { replacements: { schema }, type: QueryTypes.SELECT }
        );
        res.json({
            code: 0,
            data: rows.map(row => ({
                name: row.TABLE_NAME,
                rows: Number(row.TABLE_ROWS || 0),
                dataLength: Number(row.DATA_LENGTH || 0),
                indexLength: Number(row.INDEX_LENGTH || 0),
                comment: row.TABLE_COMMENT || ''
            }))
        });
    } catch (error) {
        res.status(500).json({ code: 500, message: error.message });
    }
});

router.get('/db-indexes/:table/columns', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const table = assertIdentifier(req.params.table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, table);
        if (!exists) {
            return res.status(404).json({ code: 404, message: '数据表不存在' });
        }
        const columns = await getTableColumns(schema, table);
        res.json({ code: 0, data: columns });
    } catch (error) {
        res.status(400).json({ code: 400, message: error.message });
    }
});

router.get('/db-indexes/:table', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const table = assertIdentifier(req.params.table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, table);
        if (!exists) {
            return res.status(404).json({ code: 404, message: '数据表不存在' });
        }
        const indexes = await getTableIndexes(schema, table);
        res.json({ code: 0, data: indexes });
    } catch (error) {
        res.status(400).json({ code: 400, message: error.message });
    }
});

router.post('/db-indexes', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const { table, name, columns, unique } = req.body || {};
        const tableName = assertIdentifier(table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, tableName);
        if (!exists) {
            return res.status(404).json({ code: 404, message: '数据表不存在' });
        }
        if (!Array.isArray(columns) || columns.length === 0) {
            return res.status(400).json({ code: 400, message: '索引字段不能为空' });
        }
        const columnSet = new Set((await getTableColumns(schema, tableName)).map(c => c.name));
        const validColumns = columns.map(col => assertIdentifier(col, '字段名')).filter(col => columnSet.has(col));
        if (validColumns.length !== columns.length) {
            return res.status(400).json({ code: 400, message: '索引字段不存在' });
        }
        let indexName = name ? assertIdentifier(name, '索引名') : `idx_${tableName}_${validColumns.join('_')}`;
        if (indexName.length > 64) {
            indexName = indexName.substring(0, 64);
        }
        const existingIndexes = await getTableIndexes(schema, tableName);
        if (existingIndexes.some(idx => idx.name === indexName)) {
            return res.status(400).json({ code: 400, message: '索引已存在' });
        }
        if (indexName === 'PRIMARY') {
            return res.status(400).json({ code: 400, message: '索引名不可为PRIMARY' });
        }
        const columnSql = validColumns.map(col => `\`${col}\``).join(', ');
        const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` ON \`${tableName}\` (${columnSql})`;
        await sequelize.query(sql);
        res.json({ code: 0, data: { name: indexName }, message: '索引已创建' });
    } catch (error) {
        res.status(400).json({ code: 400, message: error.message });
    }
});

router.delete('/db-indexes/:table/:indexName', adminAuth, checkPermission('system'), async (req, res) => {
    try {
        const tableName = assertIdentifier(req.params.table, '表名');
        const indexName = assertIdentifier(req.params.indexName, '索引名');
        if (indexName === 'PRIMARY') {
            return res.status(400).json({ code: 400, message: '主键索引不可删除' });
        }
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, tableName);
        if (!exists) {
            return res.status(404).json({ code: 404, message: '数据表不存在' });
        }
        const indexes = await getTableIndexes(schema, tableName);
        if (!indexes.some(idx => idx.name === indexName)) {
            return res.status(404).json({ code: 404, message: '索引不存在' });
        }
        const sql = `DROP INDEX \`${indexName}\` ON \`${tableName}\``;
        await sequelize.query(sql);
        res.json({ code: 0, message: '索引已删除' });
    } catch (error) {
        res.status(400).json({ code: 400, message: error.message });
    }
});

module.exports = router;
