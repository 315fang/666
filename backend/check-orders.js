require('dotenv').config();
const { Sequelize } = require('sequelize');
const seq = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST, dialect: 'mysql', logging: false
});

seq.query("SELECT id, order_no, status, total_amount, created_at FROM orders WHERE status='pending' ORDER BY created_at DESC LIMIT 10", { type: 'SELECT' })
.then(rows => {
  console.log('\n最近待付款订单：');
  rows.forEach(r => console.log(`  id=${r.id}  ${r.order_no}  ¥${r.total_amount}  ${r.created_at}`));
  seq.close();
})
.catch(e => { console.log(e.message); seq.close(); });
