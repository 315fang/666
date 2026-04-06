/**
 * 运维脚本：手动把「商户已收款但本地仍为待支付」的订单改为已支付。
 * 正常链路应由 V3 回调 /api/wechat/pay/notify 更新状态；本脚本仅在偶发漏回调时慎用。
 * 运行：在 backend 目录执行 node fix-paid-orders.js（先改下方 ORDER_NOS）
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const seq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST, dialect: 'mysql', logging: false
});

// 填入需要修复的订单号（微信后台确认已收款的）
const ORDER_NOS = [
  'ORD202603132150440002134297',
  'ORD202603132148200001655206',
];

async function main() {
  const now = new Date();
  console.log('\n开始修复订单状态...\n');

  for (const orderNo of ORDER_NOS) {
    const [rows] = await seq.query(
      "SELECT id, order_no, status, total_amount FROM orders WHERE order_no = ?",
      { replacements: [orderNo], type: 'SELECT' }
    );
    const order = rows;

    if (!order) {
      console.log(`  ✗ 订单 ${orderNo} 不存在`);
      continue;
    }

    if (order.status !== 'pending') {
      console.log(`  ⚠ 订单 ${orderNo} 当前状态为 ${order.status}，跳过`);
      continue;
    }

    await seq.query(
      "UPDATE orders SET status='paid', paid_at=? WHERE order_no=? AND status='pending'",
      { replacements: [now, orderNo] }
    );

    console.log(`  ✅ 订单 ${orderNo} 已标记为已支付 (¥${order.total_amount})`);
  }

  console.log('\n完成。请刷新小程序订单列表查看效果。\n');
  console.log('注意：此脚本仅更新订单状态，不触发佣金结算等后续逻辑。');
  console.log('      生产环境请务必通过微信回调机制处理，确保流程完整。\n');
  await seq.close();
}

main().catch(e => { console.log('错误:', e.message); seq.close(); });
