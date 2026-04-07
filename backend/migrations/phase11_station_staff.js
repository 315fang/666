const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

async function tableExists(qi, table) {
    try {
        await qi.describeTable(table);
        return true;
    } catch {
        return false;
    }
}

async function addColumnIfMissing(qi, table, columnName, definition) {
    const columns = await qi.describeTable(table);
    if (columns[columnName]) {
        console.log(`⏭️  ${table}.${columnName} 已存在，跳过`);
        return;
    }
    await qi.addColumn(table, columnName, definition);
    console.log(`✅ 已补充字段 ${table}.${columnName}`);
}

async function indexExists(qi, table, indexName) {
    const indexes = await qi.showIndex(table);
    return indexes.some((item) => item && item.name === indexName);
}

async function addIndexIfMissing(qi, table, fields, options) {
    const indexName = options && options.name;
    if (indexName && await indexExists(qi, table, indexName)) {
        console.log(`⏭️  索引 ${indexName} 已存在，跳过`);
        return;
    }
    await qi.addIndex(table, fields, options);
    console.log(`✅ 已创建索引 ${indexName || fields.join('_')}`);
}

async function seedClaimantsAsManagers() {
    const [rows] = await sequelize.query(`
        SELECT ss.id, ss.claimant_id
        FROM service_stations ss
        WHERE ss.claimant_id IS NOT NULL
    `);

    if (!Array.isArray(rows) || rows.length === 0) {
        console.log('⏭️  未发现需要迁移的历史认领人');
        return;
    }

    const [result] = await sequelize.query(`
        INSERT INTO station_staff (station_id, user_id, role, can_verify, status, remark, created_at, updated_at)
        SELECT ss.id, ss.claimant_id, 'manager', 1, 'active', '历史认领人迁移', NOW(), NOW()
        FROM service_stations ss
        WHERE ss.claimant_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1
            FROM station_staff s
            WHERE s.station_id = ss.id AND s.user_id = ss.claimant_id
        )
    `);

    const inserted = typeof result?.affectedRows === 'number' ? result.affectedRows : 0;
    console.log(`✅ 历史认领人迁移完成，新增 ${inserted} 条`);
}

async function runMigration() {
    const qi = sequelize.getQueryInterface();
    console.log('\n🚀 Phase11: station_staff 门店成员表\n');
    try {
        await sequelize.authenticate();

        if (!await tableExists(qi, 'station_staff')) {
            await qi.createTable('station_staff', {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                station_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: '门店ID'
                },
                user_id: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                    comment: '成员用户ID'
                },
                role: {
                    type: DataTypes.ENUM('manager', 'staff'),
                    allowNull: false,
                    defaultValue: 'staff',
                    comment: '门店角色'
                },
                can_verify: {
                    type: DataTypes.TINYINT,
                    allowNull: false,
                    defaultValue: 0,
                    comment: '是否有核销权限'
                },
                status: {
                    type: DataTypes.ENUM('active', 'inactive'),
                    allowNull: false,
                    defaultValue: 'active',
                    comment: '成员状态'
                },
                remark: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    comment: '备注'
                },
                created_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
            console.log('✅ 已创建 station_staff 表');
        } else {
            console.log('ℹ️  station_staff 已存在，进入补齐模式');
        }

        await addColumnIfMissing(qi, 'station_staff', 'role', {
            type: DataTypes.ENUM('manager', 'staff'),
            allowNull: false,
            defaultValue: 'staff',
            comment: '门店角色'
        });
        await addColumnIfMissing(qi, 'station_staff', 'can_verify', {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0,
            comment: '是否有核销权限'
        });
        await addColumnIfMissing(qi, 'station_staff', 'status', {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '成员状态'
        });
        await addColumnIfMissing(qi, 'station_staff', 'remark', {
            type: DataTypes.STRING(255),
            allowNull: true,
            comment: '备注'
        });
        await addColumnIfMissing(qi, 'station_staff', 'created_at', {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        });
        await addColumnIfMissing(qi, 'station_staff', 'updated_at', {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
        });

        await addIndexIfMissing(qi, 'station_staff', ['station_id', 'user_id'], {
            unique: true,
            name: 'uniq_station_staff_station_user'
        });
        await addIndexIfMissing(qi, 'station_staff', ['user_id', 'status'], {
            name: 'idx_station_staff_user_status'
        });
        await addIndexIfMissing(qi, 'station_staff', ['station_id', 'status'], {
            name: 'idx_station_staff_station_status'
        });

        try {
            await seedClaimantsAsManagers();
        } catch (e) {
            console.warn('⚠️  历史数据迁移跳过:', e.message);
        }

        console.log('\n🎉 Phase11 完成\n');
    } catch (e) {
        console.error('❌ 迁移失败:', e.message);
        throw e;
    } finally {
        await sequelize.close();
    }
}

if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { runMigration };
