-- =====================================================
-- 会员编号 + 用户状态 + 备注标签：数据库迁移
-- 执行时机：部署前在 MySQL 执行一次
-- =====================================================

-- 1. 给 users 表添加 member_no 字段
ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `member_no` VARCHAR(20) NULL UNIQUE COMMENT '会员编号，格式 M+年月+流水号，注册自动生成' AFTER `openid`,
    ADD COLUMN IF NOT EXISTS `status`    TINYINT(1)  NOT NULL DEFAULT 1 COMMENT '账号状态: 1-正常 0-封禁' AFTER `debt_amount`,
    ADD COLUMN IF NOT EXISTS `remark`    VARCHAR(500) NULL COMMENT '内部备注（管理员可编辑）' AFTER `status`,
    ADD COLUMN IF NOT EXISTS `tags`      VARCHAR(255) NULL COMMENT '内部标签 JSON数组' AFTER `remark`;

-- 2. 给已有用户批量生成 member_no（上线前补全）
--    规则：M + 注册年月 + 用户id补5位
UPDATE `users`
SET `member_no` = CONCAT(
    'M',
    DATE_FORMAT(`created_at`, '%Y%m'),
    LPAD(`id`, 5, '0')
)
WHERE `member_no` IS NULL;

-- 3. 验证
-- SELECT id, nickname, member_no, status FROM users LIMIT 20;
