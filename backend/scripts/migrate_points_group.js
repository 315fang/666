/**
 * 数据库迁移脚本：积分体系 + 拼团系统
 * 
 * 在服务器上运行：
 *   node scripts/migrate_points_group.js
 * 
 * 或在开发环境（先设置好 .env）：
 *   node scripts/migrate_points_group.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

const SQL_STATEMENTS = [
    // ============ 积分账户表 ============
    `CREATE TABLE IF NOT EXISTS point_accounts (
        id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id        INT          NOT NULL UNIQUE COMMENT '关联用户ID',
        total_points   INT          NOT NULL DEFAULT 0 COMMENT '累计获得积分（只增不减）',
        used_points    INT          NOT NULL DEFAULT 0 COMMENT '已使用/已过期积分',
        balance_points INT          NOT NULL DEFAULT 0 COMMENT '当前可用余额',
        level          TINYINT      NOT NULL DEFAULT 1 COMMENT '积分等级: 1-4',
        last_checkin   DATE         NULL     COMMENT '最后签到日期',
        checkin_streak INT          NOT NULL DEFAULT 0 COMMENT '连续签到天数',
        created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_pa_user_id (user_id),
        INDEX idx_pa_level (level)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户积分账户'`,

    // ============ 积分流水表 ============
    `CREATE TABLE IF NOT EXISTS point_logs (
        id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id       INT          NOT NULL COMMENT '用户ID',
        points        INT          NOT NULL COMMENT '积分变动量（正=收入 负=支出）',
        type          VARCHAR(30)  NOT NULL COMMENT '类型标识',
        ref_id        VARCHAR(64)  NULL     COMMENT '关联业务ID',
        remark        VARCHAR(200) NULL     COMMENT '说明文字',
        balance_after INT          NOT NULL DEFAULT 0 COMMENT '操作后余额快照',
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pl_user_id (user_id),
        INDEX idx_pl_type (type),
        INDEX idx_pl_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分流水记录'`,

    // ============ 拼团活动配置表 ============
    `CREATE TABLE IF NOT EXISTS group_activities (
        id              INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product_id      INT            NOT NULL COMMENT '关联商品ID',
        sku_id          INT            NULL     COMMENT '指定SKU（NULL=全规格适用）',
        min_members     INT            NOT NULL DEFAULT 2 COMMENT '最少成团人数',
        max_members     INT            NOT NULL DEFAULT 10 COMMENT '最多人数',
        group_price     DECIMAL(10,2)  NOT NULL COMMENT '拼团价格',
        original_price  DECIMAL(10,2)  NULL     COMMENT '对比原价（划线价）',
        expire_hours    INT            NOT NULL DEFAULT 24 COMMENT '开团有效小时数',
        stock_limit     INT            NOT NULL DEFAULT 999 COMMENT '活动总库存',
        sold_count      INT            NOT NULL DEFAULT 0 COMMENT '已成功件数',
        status          TINYINT        NOT NULL DEFAULT 1 COMMENT '1=上线 0=下线',
        start_at        DATETIME       NULL     COMMENT '活动开始时间',
        end_at          DATETIME       NULL     COMMENT '活动结束时间',
        created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ga_product_id (product_id),
        INDEX idx_ga_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团活动配置'`,

    // ============ 拼团团次表 ============
    `CREATE TABLE IF NOT EXISTS group_orders (
        id              INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_no        VARCHAR(32)    NOT NULL UNIQUE COMMENT '团次编号',
        activity_id     INT            NOT NULL COMMENT '关联活动ID',
        product_id      INT            NOT NULL COMMENT '商品ID',
        leader_id       INT            NOT NULL COMMENT '团长用户ID',
        inviter_id      INT            NULL     COMMENT '带来团长的分享用户',
        status          VARCHAR(20)    NOT NULL DEFAULT 'open' COMMENT 'open/success/fail/cancelled',
        current_members INT            NOT NULL DEFAULT 0 COMMENT '当前成员数',
        min_members     INT            NOT NULL COMMENT '成团最少人数（快照）',
        max_members     INT            NOT NULL DEFAULT 10 COMMENT '最多人数（快照）',
        group_price     DECIMAL(10,2)  NOT NULL COMMENT '成团价格（快照）',
        expire_at       DATETIME       NOT NULL COMMENT '失效时间',
        success_at      DATETIME       NULL     COMMENT '成团时间',
        failed_at       DATETIME       NULL     COMMENT '失败时间',
        created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_go_activity_id (activity_id),
        INDEX idx_go_leader_id (leader_id),
        INDEX idx_go_status (status),
        INDEX idx_go_expire_at (expire_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团团次记录'`,

    // ============ 拼团成员表 ============
    `CREATE TABLE IF NOT EXISTS group_members (
        id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
        group_order_id   INT          NOT NULL COMMENT '关联团次ID',
        user_id          INT          NOT NULL COMMENT '参团用户ID',
        order_id         INT          NULL     COMMENT '实际支付订单ID',
        is_leader        TINYINT      NOT NULL DEFAULT 0 COMMENT '1=团长 0=普通成员',
        inviter_id       INT          NULL     COMMENT '带来此成员的用户（分销归因）',
        is_new_user      TINYINT      NOT NULL DEFAULT 0 COMMENT '加入时是否为新用户',
        was_bound        TINYINT      NOT NULL DEFAULT 0 COMMENT '是否通过拼团绑定了分销关系',
        status           VARCHAR(20)  NOT NULL DEFAULT 'joined' COMMENT 'joined/paid/refunded',
        join_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at          DATETIME     NULL     COMMENT '支付时间',
        created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_gm_group_user (group_order_id, user_id),
        INDEX idx_gm_user_id (user_id),
        INDEX idx_gm_inviter_id (inviter_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团成员记录'`,

    // ============ 为现有用户创建积分账户（Lv1） ============
    `INSERT IGNORE INTO point_accounts (user_id, total_points, used_points, balance_points, level)
     SELECT id, 0, 0, 0, 1 FROM users`
];

async function run() {
    console.log('\n🚀 开始执行迁移: 积分体系 + 拼团系统\n');
    console.log(`  数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`  用户: ${process.env.DB_USER}\n`);

    try {
        await sequelize.authenticate();
        console.log('✅ 数据库连接成功\n');

        for (let i = 0; i < SQL_STATEMENTS.length; i++) {
            const sql = SQL_STATEMENTS[i];
            const preview = sql.trim().split('\n')[0].substring(0, 80);
            process.stdout.write(`  [${i + 1}/${SQL_STATEMENTS.length}] ${preview}...`);
            try {
                await sequelize.query(sql, { type: QueryTypes.RAW });
                console.log(' ✅');
            } catch (err) {
                console.log(` ❌`);
                console.error(`     错误: ${err.message}\n`);
                if (err.message.includes('Duplicate') || err.message.includes('already exists')) {
                    console.log('     (已存在，跳过)\n');
                } else {
                    throw err;
                }
            }
        }

        console.log('\n🎉 迁移完成！');
        console.log('\n新增表：');
        console.log('  ✅ point_accounts  - 积分账户（注册自动创建，默认Lv1享包邮）');
        console.log('  ✅ point_logs      - 积分流水');
        console.log('  ✅ group_activities - 拼团活动配置');
        console.log('  ✅ group_orders    - 拼团团次');
        console.log('  ✅ group_members   - 拼团成员');
        console.log('\n新增API：');
        console.log('  GET  /api/points/account   - 我的积分账户');
        console.log('  GET  /api/points/logs      - 积分流水');
        console.log('  POST /api/points/checkin   - 每日签到');
        console.log('  GET  /api/points/tasks     - 任务中心');
        console.log('  GET  /api/group/activities - 拼团活动列表');
        console.log('  GET  /api/group/orders/:no - 团次详情');
        console.log('  POST /api/group/orders     - 发起拼团');
        console.log('  POST /api/group/orders/:no/join - 参团');
        console.log('  GET  /api/group/my         - 我的拼团\n');

    } catch (err) {
        console.error('\n❌ 迁移失败:', err.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

run();
