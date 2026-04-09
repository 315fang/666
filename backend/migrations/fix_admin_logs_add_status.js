'use strict';

/**
 * 迁移：给 admin_logs 表补充 status 和 error_message 字段
 * 问题背景：AdminLog 模型缺少 status 字段，导致前端操作日志页面
 * 所有记录的「结果」列都显示为「失败」（前端从 status 字段判断）
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('admin_logs');

    if (!tableDesc.status) {
      await queryInterface.addColumn('admin_logs', 'status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'success',
        comment: '操作结果: success/failed',
        after: 'user_agent'
      });
    }

    if (!tableDesc.error_message) {
      await queryInterface.addColumn('admin_logs', 'error_message', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '失败原因',
        after: 'status'
      });
    }

    // 将历史数据默认设置为 success（历史日志是成功写入才记录的）
    await queryInterface.sequelize.query(
      "UPDATE admin_logs SET status = 'success' WHERE status IS NULL"
    );
  },

  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('admin_logs');
    if (tableDesc.error_message) {
      await queryInterface.removeColumn('admin_logs', 'error_message');
    }
    if (tableDesc.status) {
      await queryInterface.removeColumn('admin_logs', 'status');
    }
  }
};
