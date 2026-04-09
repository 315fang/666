#!/usr/bin/env node
/**
 * convert.js — MySQL dump → 微信云数据库 JSONL 批量转换工具
 *
 * 使用方式：
 *   node convert.js
 *
 * 输出：
 *   mysql/jsonl/<tablename>.jsonl   （每张表一个文件，每行一条记录）
 *
 * 云数据库导入步骤：
 *   1. 云开发控制台 → 数据库 → 选择/新建集合
 *   2. 导入 → 选择对应的 .jsonl 文件 → 格式选 JSON Lines → 确认导入
 */

const fs   = require('fs');
const path = require('path');

/* ─────────────────── 配置 ─────────────────── */
const SQL_FILE   = path.join(__dirname, 's2b2c_db_20260407192328p0a90.sql');
const OUTPUT_DIR = path.join(__dirname, 'jsonl');

// MySQL 表名 → 云数据库集合名映射（不在此表的按原名导出）
const TABLE_MAP = {
    users:                    'users',
    products:                 'products',
    product_skus:             'skus',
    categories:               'categories',
    orders:                   'orders',
    cart_items:               'cart_items',
    addresses:                'addresses',
    reviews:                  'reviews',
    refunds:                  'refunds',
    commission_logs:          'commissions',
    commission_settlements:   'commission_settlements',
    withdrawals:              'withdrawals',
    agent_wallet_accounts:    'wallet_accounts',
    agent_wallet_logs:        'wallet_logs',
    agent_wallet_recharge_orders: 'wallet_recharge_orders',
    coupons:                  'coupons',
    user_coupons:             'user_coupons',
    point_accounts:           'point_accounts',
    point_logs:               'point_logs',
    notifications:            'notifications',
    service_stations:         'stations',
    system_configs:           'configs',
    app_configs:              'app_configs',
    splash_screens:           'splash_screens',
    themes:                   'themes',
    banners:                  'banners',
    home_sections:            'home_sections',
    page_layouts:             'page_layouts',
    content_boards:           'content_boards',
    content_board_products:   'content_board_products',
    slash_activities:         'slash_activities',
    slash_records:            'slash_records',
    slash_helpers:            'slash_helpers',
    group_activities:         'group_activities',
    group_orders:             'group_orders',
    group_members:            'group_members',
    lottery_prizes:           'lottery_prizes',
    lottery_records:          'lottery_records',
    user_product_favorites:   'user_favorites',
    portal_accounts:          'portal_accounts',
    pickup_station_verifiers: 'pickup_verifiers',
    activity_logs:            'activity_logs',
    activity_spot_stock:      'activity_spot_stock',
};

// boolean 字段识别（包含这些字样的字段名用 0/1 → false/true）
const BOOL_FIELDS = [
    'is_', 'has_', 'enable', 'enabled', 'active', 'status',
    'default', 'visible', 'published', 'deleted', 'verified',
    'is_read', 'is_paid', 'is_refunded', 'is_default', 'is_active',
];

// JSON 字段识别（字段名含这些关键词时尝试 JSON.parse）
const JSON_FIELDS = ['config', 'meta', 'extra', 'data', 'items', 'specs', 'options',
                     'tags', 'images', 'attrs', 'properties', 'params', 'settings'];

/* ─────────────────── SQL 解析工具 ─────────────────── */

/**
 * 从 CREATE TABLE 语句提取列名和类型
 * @returns Map<string, {type,isBool,isJson,isDatetime}>
 */
function parseSchema(createSql) {
    const schema = new Map();
    const lines = createSql.split('\n');
    for (const line of lines) {
        const m = line.trim().match(/^`([^`]+)`\s+(\w+)/);
        if (!m) continue;
        const col  = m[1];
        const type = m[2].toLowerCase();
        const lc   = col.toLowerCase();
        const isBool     = (type === 'tinyint' && (lc.startsWith('is_') || lc.startsWith('has_') || BOOL_FIELDS.some(k => lc.includes(k))));
        const isDatetime = type === 'datetime' || type === 'timestamp' || lc.endsWith('_at') || lc.endsWith('_time');
        const isJson     = type === 'json' || JSON_FIELDS.some(k => lc.includes(k));
        schema.set(col, { type, isBool, isDatetime, isJson });
    }
    return schema;
}

/**
 * 解析 MySQL VALUES 字符串为原始值数组
 * 处理：引号字符串、转义、NULL、数字
 */
function parseValues(valStr) {
    const rows = [];
    let i = 0;
    const len = valStr.length;

    while (i < len) {
        if (valStr[i] !== '(') { i++; continue; }
        i++; // skip '('
        const row = [];
        while (i < len && valStr[i] !== ')') {
            if (valStr[i] === ',') { i++; continue; } // separator between fields

            if (valStr[i] === "'") {
                // 引号字符串
                i++;
                let s = '';
                while (i < len) {
                    if (valStr[i] === '\\') {
                        const next = valStr[i + 1];
                        if (next === "'")  { s += "'";  i += 2; }
                        else if (next === '\\') { s += '\\'; i += 2; }
                        else if (next === 'n')  { s += '\n'; i += 2; }
                        else if (next === 'r')  { s += '\r'; i += 2; }
                        else if (next === 't')  { s += '\t'; i += 2; }
                        else                    { s += next; i += 2; }
                    } else if (valStr[i] === "'") {
                        // check for '' (escaped quote)
                        if (valStr[i + 1] === "'") { s += "'"; i += 2; }
                        else { i++; break; }
                    } else {
                        s += valStr[i++];
                    }
                }
                row.push(s);
            } else if (valStr.substring(i, i + 4).toUpperCase() === 'NULL') {
                row.push(null);
                i += 4;
            } else {
                // number or keyword
                let num = '';
                while (i < len && valStr[i] !== ',' && valStr[i] !== ')') {
                    num += valStr[i++];
                }
                num = num.trim();
                if (num === '') continue;
                row.push(isNaN(num) ? num : Number(num));
            }
        }
        if (valStr[i] === ')') i++;
        // skip optional comma between row tuples
        while (i < len && (valStr[i] === ',' || valStr[i] === '\n' || valStr[i] === '\r' || valStr[i] === ' ')) i++;
        if (row.length > 0) rows.push(row);
    }
    return rows;
}

/**
 * 值类型转换
 */
function convertValue(val, colMeta) {
    if (val === null || val === undefined) return null;
    if (!colMeta) return val;

    const { isBool, isDatetime, isJson, type } = colMeta;

    // Boolean
    if (isBool && typeof val === 'number') return val !== 0;

    // Datetime → ISO string（已经是字符串格式 'YYYY-MM-DD HH:MM:SS'）
    if (isDatetime && typeof val === 'string') {
        try { return new Date(val).toISOString(); }
        catch (_) { return val; }
    }

    // JSON 字段尝试解析
    if (isJson && typeof val === 'string' && val.length > 0 && (val[0] === '{' || val[0] === '[')) {
        try { return JSON.parse(val); }
        catch (_) { return val; }
    }

    return val;
}

/* ─────────────────── 主流程 ─────────────────── */

console.log('📖 读取 SQL 文件...');
const sql   = fs.readFileSync(SQL_FILE, 'utf8');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 提取所有 CREATE TABLE 块
const createRegex = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\) ENGINE=/g;
const schemas     = new Map();
let m;
while ((m = createRegex.exec(sql)) !== null) {
    schemas.set(m[1], parseSchema(m[2]));
}
console.log(`✅ 解析了 ${schemas.size} 张表的结构`);

// 提取所有 INSERT INTO 块，逐表处理
const insertRegex = /INSERT INTO `([^`]+)` VALUES ([\s\S]*?);$/gm;
const tableCounts = {};

while ((m = insertRegex.exec(sql)) !== null) {
    const tableName  = m[1];
    const valStr     = m[2];
    const schema     = schemas.get(tableName) || new Map();
    const colNames   = [...schema.keys()];
    const collName   = TABLE_MAP[tableName] || tableName;
    const outFile    = path.join(OUTPUT_DIR, `${collName}.jsonl`);

    const rows = parseValues(valStr);

    // 追加写入（同一张表可能有多条 INSERT 语句）
    const fd = fs.openSync(outFile, 'a');
    let count = 0;
    for (const row of rows) {
        const obj = {};
        for (let i = 0; i < row.length; i++) {
            const colName = colNames[i] || `col_${i}`;
            const colMeta = schema.get(colName);
            const val = convertValue(row[i], colMeta);
            if (val !== null) obj[colName] = val;
            else obj[colName] = null;
        }
        fs.writeSync(fd, JSON.stringify(obj) + '\n');
        count++;
    }
    fs.closeSync(fd);

    tableCounts[collName] = (tableCounts[collName] || 0) + count;
}

// 输出统计
console.log('\n📊 转换完成统计：');
const sorted = Object.entries(tableCounts).sort((a, b) => b[1] - a[1]);
for (const [name, cnt] of sorted) {
    console.log(`  ${String(cnt).padStart(6)} 条  →  ${name}.jsonl`);
}

// 生成导入说明
const guide = [
    '# 云数据库导入指南',
    '',
    '## 导入步骤',
    '1. 微信开发者工具 → 云开发 → 数据库',
    '2. 新建集合（集合名 = 文件名去掉 .jsonl）',
    '3. 点击集合 → 导入 → 选择 .jsonl 文件 → 格式 JSON Lines → 冲突处理：插入 → 确认',
    '',
    '## 优先导入顺序（基础数据先导入）',
    '1. categories.jsonl       — 商品分类',
    '2. products.jsonl         — 商品',
    '3. skus.jsonl             — 规格',
    '4. users.jsonl            — 用户',
    '5. addresses.jsonl        — 地址',
    '6. orders.jsonl           — 订单',
    '7. configs.jsonl          — 系统配置',
    '8. app_configs.jsonl      — 小程序配置',
    '9. splash_screens.jsonl   — 开屏页',
    '10. banners.jsonl         — Banner',
    '11. coupons.jsonl         — 优惠券',
    '12. user_coupons.jsonl    — 用户优惠券',
    '13. commissions.jsonl     — 佣金记录',
    '14. withdrawals.jsonl     — 提现记录',
    '15. 其余表按需导入',
    '',
    '## 集合权限设置（导入后手动设置）',
    '| 集合 | 推荐权限 |',
    '|------|---------|',
    '| products, categories, banners | 所有人可读 |',
    '| users, orders, addresses | 仅创建者可读写（通过云函数） |',
    '| commissions, withdrawals | 仅管理员 |',
    '| configs, app_configs, splash_screens | 所有人可读 |',
    '',
    '## 生成记录数',
    ...sorted.map(([n, c]) => `- ${n}: ${c} 条`),
].join('\n');

fs.writeFileSync(path.join(OUTPUT_DIR, 'IMPORT_GUIDE.md'), guide, 'utf8');
console.log('\n📄 已生成导入指南: jsonl/IMPORT_GUIDE.md');
console.log(`\n✅ 所有文件输出到: ${OUTPUT_DIR}`);
