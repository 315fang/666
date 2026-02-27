-- =============================================================
-- Migration: 积分体系 + 拼团系统
-- Date: 2026-02-23
-- =============================================================

-- ============================================================
-- PART 1: 积分体系
-- ============================================================

-- 积分账户表（每个用户一条记录）
CREATE TABLE IF NOT EXISTS point_accounts (
    id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL UNIQUE COMMENT '关联用户ID',
    total_points   INT          NOT NULL DEFAULT 0 COMMENT '累计获得积分（只增不减）',
    used_points    INT          NOT NULL DEFAULT 0 COMMENT '已使用/已过期积分',
    balance_points INT          NOT NULL DEFAULT 0 COMMENT '当前可用余额（total - used）',
    level          TINYINT      NOT NULL DEFAULT 1 COMMENT '积分等级: 1-体验官, 2-品质会员, 3-精选达人, 4-首席鉴赏家',
    last_checkin   DATE         NULL     COMMENT '最后签到日期',
    checkin_streak INT          NOT NULL DEFAULT 0 COMMENT '连续签到天数',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户积分账户';

-- 积分流水表
CREATE TABLE IF NOT EXISTS point_logs (
    id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL COMMENT '用户ID',
    points        INT          NOT NULL COMMENT '积分变动量（正=收入 负=支出/过期）',
    type          VARCHAR(30)  NOT NULL COMMENT '类型: purchase/share/review/checkin/invite_success/group_start/group_success/redeem/expire/register',
    ref_id        VARCHAR(64)  NULL     COMMENT '关联业务ID（订单号/分享ID等）',
    remark        VARCHAR(200) NULL     COMMENT '说明文字',
    balance_after INT          NOT NULL DEFAULT 0 COMMENT '操作后余额快照',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_type (type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分流水记录';


-- ============================================================
-- PART 2: 拼团系统
-- ============================================================

-- 拼团活动配置表（管理员在后台配置哪些商品参加拼团）
CREATE TABLE IF NOT EXISTS group_activities (
    id              INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id      INT            NOT NULL COMMENT '关联商品ID',
    sku_id          INT            NULL     COMMENT 'NULL=全规格适用，非NULL=指定SKU',
    min_members     INT            NOT NULL DEFAULT 2 COMMENT '最少成团人数',
    max_members     INT            NOT NULL DEFAULT 10 COMMENT '最多参团人数（超过无法加入）',
    group_price     DECIMAL(10,2)  NOT NULL COMMENT '拼团价格',
    original_price  DECIMAL(10,2)  NULL     COMMENT '对比原价（显示划线价，NULL则用商品零售价）',
    expire_hours    INT            NOT NULL DEFAULT 24 COMMENT '开团后有效小时数',
    stock_limit     INT            NOT NULL DEFAULT 999 COMMENT '活动总库存（独立于商品库存）',
    sold_count      INT            NOT NULL DEFAULT 0 COMMENT '已拼成功件数',
    status          TINYINT        NOT NULL DEFAULT 1 COMMENT '1=上线 0=下线',
    start_at        DATETIME       NULL     COMMENT '活动开始时间（NULL表示立即开始）',
    end_at          DATETIME       NULL     COMMENT '活动结束时间（NULL表示不限）',
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_end_at (end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团活动配置';

-- 拼团团次表（每次有人发起拼团就产生一条记录）
CREATE TABLE IF NOT EXISTS group_orders (
    id              INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_no        VARCHAR(32)    NOT NULL UNIQUE COMMENT '团次编号（对外展示）',
    activity_id     INT            NOT NULL COMMENT '关联活动ID',
    product_id      INT            NOT NULL COMMENT '商品ID（冗余）',
    leader_id       INT            NOT NULL COMMENT '团长（发起拼团的用户）',
    inviter_id      INT            NULL     COMMENT '谁的分享链接带来了团长（用于分销归因）',
    status          VARCHAR(20)    NOT NULL DEFAULT 'open' COMMENT '状态: open=进行中 success=已成团 fail=已失败 cancelled=已取消',
    current_members INT            NOT NULL DEFAULT 0 COMMENT '当前已加入人数',
    min_members     INT            NOT NULL COMMENT '成团所需最少人数（快照）',
    max_members     INT            NOT NULL DEFAULT 10 COMMENT '最多人数（快照）',
    group_price     DECIMAL(10,2)  NOT NULL COMMENT '成团价格（快照）',
    expire_at       DATETIME       NOT NULL COMMENT '团次失效时间',
    success_at      DATETIME       NULL     COMMENT '成团时间',
    failed_at       DATETIME       NULL     COMMENT '失败时间',
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_activity_id (activity_id),
    INDEX idx_leader_id (leader_id),
    INDEX idx_status (status),
    INDEX idx_expire_at (expire_at),
    INDEX idx_group_no (group_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团团次记录';

-- 拼团成员表（每个参团用户的记录）
CREATE TABLE IF NOT EXISTS group_members (
    id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_order_id   INT          NOT NULL COMMENT '关联团次ID',
    user_id          INT          NOT NULL COMMENT '参团用户ID',
    order_id         INT          NULL     COMMENT '关联的实际支付订单ID（支付后更新）',
    is_leader        TINYINT      NOT NULL DEFAULT 0 COMMENT '1=团长 0=普通成员',
    inviter_id       INT          NULL     COMMENT '★ 谁带来的这个成员（用于分销归因）',
    is_new_user      TINYINT      NOT NULL DEFAULT 0 COMMENT '加入时是否为新用户（无parent_id）',
    was_bound        TINYINT      NOT NULL DEFAULT 0 COMMENT '是否成功绑定了分销关系',
    status           VARCHAR(20)  NOT NULL DEFAULT 'joined' COMMENT '状态: joined=已加入 paid=已支付 refunded=已退款',
    join_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    paid_at          DATETIME     NULL     COMMENT '支付时间',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_group_user (group_order_id, user_id),
    INDEX idx_group_order_id (group_order_id),
    INDEX idx_user_id (user_id),
    INDEX idx_inviter_id (inviter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团成员记录';


-- ============================================================
-- PART 3: 初始化（为现有用户自动创建积分账户，Level=1）
-- ============================================================
INSERT IGNORE INTO point_accounts (user_id, total_points, used_points, balance_points, level)
SELECT id, 0, 0, 0, 1
FROM users;

-- 为现有用户补记"注册赠送"积分流水（可选，注释掉则不补录）
-- INSERT INTO point_logs (user_id, points, type, remark, balance_after)
-- SELECT id, 0, 'register', '注册自动升级Lv1，享全场包邮', 0 FROM users;
