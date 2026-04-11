const express = require('express');
const router = express.Router();
const ConfigService = require('../../services/ConfigService');
const { ok, okList, okAction, fail } = require('../../utils/adminResponse');
const { adminAuth, checkPermission } = require('../../middleware/adminAuth');
const { sequelize } = require('../../config/database');
const { QueryTypes } = require('sequelize');

/**
 * 系统配置管理路由（数据库存储，热更新）
 */

// 获取所有可编辑配置（按分组）
router.get('/system-configs', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const configs = await ConfigService.getAllEditableConfigs();
        return okList(res, configs);
    } catch (error) {
        console.error('[Config] 获取配置失败:', error);
        return fail(res, 500, error.message);
    }
});

// 获取单个配置
router.get('/system-configs/:key', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { key } = req.params;
        const value = await ConfigService.get(key);

        return ok(res, { key, value });
    } catch (error) {
        return fail(res, 500, error.message);
    }
});

// 更新单个配置
router.put('/system-configs/:key', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value, reason } = req.body;
        const adminId = req.user.id;

        const result = await ConfigService.set(key, value, adminId, reason);

        return ok(res, result, result.changed ? '配置已更新并实时生效' : '配置未变化');
    } catch (error) {
        console.error('[Config] 更新配置失败:', error);
        return fail(res, 400, error.message);
    }
});

// 批量更新配置
router.post('/system-configs/batch', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { updates, reason } = req.body;
        const adminId = req.user.id;

        if (!Array.isArray(updates) || updates.length === 0) {
            return fail(res, 400, '更新列表不能为空');
        }

        const results = await ConfigService.setMultiple(updates, adminId, reason);

        // 统计结果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        return ok(res, {
            results,
            summary: {
                total: results.length,
                success: successCount,
                failed: failCount
            }
        }, `批量更新完成：${successCount}成功, ${failCount}失败`);
    } catch (error) {
        console.error('[Config] 批量更新失败:', error);
        return fail(res, 500, error.message);
    }
});

// 获取配置修改历史
router.get('/system-configs/:key/history', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { key } = req.params;
        const { limit = 20 } = req.query;

        const history = await ConfigService.getHistory(key, parseInt(limit));

        return okList(res, history);
    } catch (error) {
        console.error('[Config] 获取历史失败:', error);
        return fail(res, 500, error.message);
    }
});

// 回滚到指定历史版本
router.post('/system-configs/:key/rollback', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { key } = req.params;
        const { history_id } = req.body;
        const adminId = req.user.id;

        if (!history_id) {
            return fail(res, 400, '缺少 history_id');
        }

        const { SystemConfigHistory } = require('../../models');
        const record = await SystemConfigHistory.findByPk(history_id);

        if (!record || record.config_key !== key) {
            return fail(res, 404, '历史记录不存在或 key 不匹配');
        }

        const result = await ConfigService.set(
            key,
            record.old_value,
            adminId,
            `回滚到历史版本 #${history_id}（原值: ${record.old_value}）`
        );

        return ok(res, result, result.changed ? `已回滚到 ${record.old_value}` : '目标值与当前值相同，无需回滚');
    } catch (error) {
        console.error('[Config] 回滚配置失败:', error);
        return fail(res, 400, error.message);
    }
});

// 刷新配置缓存
router.post('/system-configs/refresh-cache', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        await ConfigService.refreshCache();
        return okAction(res, '配置缓存已刷新');
    } catch (error) {
        return fail(res, 500, error.message);
    }
});

// 获取配置健康度
router.get('/system-configs/health', adminAuth, checkPermission('settings_manage'), async (req, res) => {
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

        return ok(res, {
            total: totalConfigs,
            editable: editableConfigs,
            groups: stats,
            healthScore: 100,
            lastUpdated: new Date()
        });
    } catch (error) {
        return fail(res, 500, error.message);
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

router.get('/db-indexes/tables', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const schema = await getDatabaseName();
        const rows = await sequelize.query(
            `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, TABLE_COMMENT
             FROM information_schema.tables
             WHERE table_schema = :schema AND table_type = 'BASE TABLE'
             ORDER BY TABLE_NAME`,
            { replacements: { schema }, type: QueryTypes.SELECT }
        );
        return okList(res, rows.map(row => ({
            name: row.TABLE_NAME,
            rows: Number(row.TABLE_ROWS || 0),
            dataLength: Number(row.DATA_LENGTH || 0),
            indexLength: Number(row.INDEX_LENGTH || 0),
            comment: row.TABLE_COMMENT || ''
        })));
    } catch (error) {
        return fail(res, 500, error.message);
    }
});

router.get('/db-indexes/:table/columns', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const table = assertIdentifier(req.params.table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, table);
        if (!exists) {
            return fail(res, 404, '数据表不存在');
        }
        const columns = await getTableColumns(schema, table);
        return okList(res, columns);
    } catch (error) {
        return fail(res, 400, error.message);
    }
});

router.get('/db-indexes/:table', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const table = assertIdentifier(req.params.table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, table);
        if (!exists) {
            return fail(res, 404, '数据表不存在');
        }
        const indexes = await getTableIndexes(schema, table);
        return okList(res, indexes);
    } catch (error) {
        return fail(res, 400, error.message);
    }
});

router.post('/db-indexes', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const { table, name, columns, unique } = req.body || {};
        const tableName = assertIdentifier(table, '表名');
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, tableName);
        if (!exists) {
            return fail(res, 404, '数据表不存在');
        }
        if (!Array.isArray(columns) || columns.length === 0) {
            return fail(res, 400, '索引字段不能为空');
        }
        const columnSet = new Set((await getTableColumns(schema, tableName)).map(c => c.name));
        const validColumns = columns.map(col => assertIdentifier(col, '字段名')).filter(col => columnSet.has(col));
        if (validColumns.length !== columns.length) {
            return fail(res, 400, '索引字段不存在');
        }
        let indexName = name ? assertIdentifier(name, '索引名') : `idx_${tableName}_${validColumns.join('_')}`;
        if (indexName.length > 64) {
            indexName = indexName.substring(0, 64);
        }
        const existingIndexes = await getTableIndexes(schema, tableName);
        if (existingIndexes.some(idx => idx.name === indexName)) {
            return fail(res, 400, '索引已存在');
        }
        if (indexName === 'PRIMARY') {
            return fail(res, 400, '索引名不可为PRIMARY');
        }
        const columnSql = validColumns.map(col => `\`${col}\``).join(', ');
        const sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` ON \`${tableName}\` (${columnSql})`;
        await sequelize.query(sql);
        return ok(res, { name: indexName }, '索引已创建');
    } catch (error) {
        return fail(res, 400, error.message);
    }
});

router.delete('/db-indexes/:table/:indexName', adminAuth, checkPermission('settings_manage'), async (req, res) => {
    try {
        const tableName = assertIdentifier(req.params.table, '表名');
        const indexName = assertIdentifier(req.params.indexName, '索引名');
        if (indexName === 'PRIMARY') {
            return fail(res, 400, '主键索引不可删除');
        }
        const schema = await getDatabaseName();
        const exists = await tableExists(schema, tableName);
        if (!exists) {
            return fail(res, 404, '数据表不存在');
        }
        const indexes = await getTableIndexes(schema, tableName);
        if (!indexes.some(idx => idx.name === indexName)) {
            return fail(res, 404, '索引不存在');
        }
        const sql = `DROP INDEX \`${indexName}\` ON \`${tableName}\``;
        await sequelize.query(sql);
        return okAction(res, '索引已删除');
    } catch (error) {
        return fail(res, 400, error.message);
    }
});

module.exports = router;
