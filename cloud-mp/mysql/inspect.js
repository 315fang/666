const fs = require('fs');
const tables = ['cart_items','skus','app_configs','configs','splash_screens','banners','page_layouts','refunds','reviews','withdrawals','commissions','addresses'];
for (const t of tables) {
  const f = __dirname + '/jsonl/' + t + '.jsonl';
  if (!fs.existsSync(f)) { console.log('[' + t + ']: 文件不存在'); continue; }
  const line = fs.readFileSync(f,'utf8').split('\n').find(l => l.trim());
  if (!line) { console.log('[' + t + ']: 无数据'); continue; }
  try {
    const obj = JSON.parse(line);
    console.log('[' + t + ']');
    console.log('  ' + Object.keys(obj).join(' | '));
    console.log('');
  } catch(e) { console.log('[' + t + ']: 解析失败'); }
}
