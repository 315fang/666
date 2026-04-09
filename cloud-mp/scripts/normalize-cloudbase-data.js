const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'mysql', 'jsonl');
const targetRoot = path.join(projectRoot, 'cloudbase-seed');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonl(name) {
  const filePath = path.join(sourceRoot, `${name}.json`);
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJson(name, value) {
  ensureDir(targetRoot);
  fs.writeFileSync(path.join(targetRoot, `${name}.json`), JSON.stringify(value, null, 2));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toBoolean(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function parseObject(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

function centsFromYuan(value) {
  return Math.round(toNumber(value, 0) * 100);
}

function normalizeUsers(users) {
  return users.map((row) => ({
    _id: row.openid || `legacy-user-${row.id}`,
    _legacy_id: row.id,
    openid: row.openid || '',
    nickName: row.nickName || row.nickname || '新用户',
    avatarUrl: row.avatarUrl || row.avatar_url || '',
    phone: row.phone || '',
    role_level: toNumber(row.role_level, 0),
    distributor_level: toNumber(row.distributor_level != null ? row.distributor_level : row.agent_level, 0),
    points: toNumber(row.points != null ? row.points : row.growth_value, 0),
    wallet_balance: toNumber(row.wallet_balance != null ? row.wallet_balance : row.balance, 0),
    referrer_openid: row.referrer_openid || row.parent_openid || '',
    my_invite_code: row.my_invite_code || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeCategories(categories) {
  return categories.map((row) => ({
    _id: String(row.id),
    _legacy_id: row.id,
    name: row.name || '',
    image: row.image || row.icon || '',
    parent_id: row.parent_id != null ? String(row.parent_id) : '',
    level: row.parent_id ? 2 : 1,
    status: toBoolean(row.status) ? 1 : 0,
    sort_order: toNumber(row.sort_order, 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeProducts(products) {
  return products.map((row) => ({
    _id: String(row.id),
    _legacy_id: row.id,
    name: row.name || '',
    description: row.description || '',
    images: toArray(row.images),
    detail_images: toArray(row.detail_images),
    category_id: row.category_id != null ? String(row.category_id) : '',
    status: toBoolean(row.status) ? 'on_sale' : 'off_sale',
    min_price: centsFromYuan(row.retail_price),
    original_price: centsFromYuan(row.market_price || row.retail_price),
    sales_count: toNumber(row.sales_count != null ? row.sales_count : row.purchase_count, 0),
    stock: toNumber(row.stock, 0),
    sort_order: toNumber(row.manual_weight != null ? row.manual_weight : row.sort_order, 0),
    tags: [row.product_tag].filter(Boolean),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeSkus(skus) {
  return skus.map((row) => ({
    _id: row._id || String(row.id),
    _legacy_id: row.id || null,
    product_id: row.product_id != null ? String(row.product_id) : '',
    name: row.name || '',
    spec: row.spec || row.specs || '',
    image: row.image || toArray(row.images)[0] || '',
    price: centsFromYuan(row.price != null ? row.price : row.retail_price),
    original_price: centsFromYuan(row.original_price != null ? row.original_price : (row.market_price != null ? row.market_price : row.price)),
    stock: toNumber(row.stock, 0),
    sku_code: row.sku_code || '',
    sort_order: toNumber(row.sort_order, 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function buildFallbackSkusFromProducts(products) {
  return products.map((row) => ({
    _id: `fallback-sku-${row.id}`,
    _legacy_id: null,
    product_id: String(row.id),
    name: row.name || '默认规格',
    spec: row.spec || '默认规格',
    image: toArray(row.images)[0] || '',
    price: centsFromYuan(row.retail_price),
    original_price: centsFromYuan(row.market_price || row.retail_price),
    stock: toNumber(row.stock, 0),
    sku_code: '',
    sort_order: 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    _generated: true
  }));
}

function normalizeCartItems(cartItems, users) {
  const userMap = new Map(users.map((user) => [user._legacy_id, user.openid]));
  return cartItems.map((row) => ({
    _id: row._id || `cart-${row.id}`,
    _legacy_id: row.id || null,
    openid: row.openid || row.user_id || userMap.get(row.user_id) || '',
    sku_id: row.sku_id != null ? String(row.sku_id) : '',
    product_id: row.product_id != null ? String(row.product_id) : '',
    qty: toNumber(row.qty != null ? row.qty : row.quantity, 1),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeOrders(orders, users) {
  const userMap = new Map(users.map((user) => [user._legacy_id, user.openid]));
  return orders.map((row) => {
    const addressSnapshot = parseObject(row.address_snapshot, {});
    const qty = toNumber(row.quantity, 1);
    const payAmount = centsFromYuan(row.actual_price != null ? row.actual_price : row.total_amount);
    const totalAmount = centsFromYuan(row.total_amount);
    return {
      _id: row._id || `order-${row.id}`,
      _legacy_id: row.id,
      openid: row.openid || row.buyer_id || userMap.get(row.buyer_id) || '',
      order_no: row.order_no || '',
      status: row.status || 'pending_payment',
      total_amount: totalAmount,
      pay_amount: payAmount,
      address_snapshot: addressSnapshot,
      remark: row.remark || '',
      delivery_type: row.delivery_type || 'express',
      items: row.items && Array.isArray(row.items) ? row.items : [{
        sku_id: row.sku_id != null ? String(row.sku_id) : '',
        product_id: row.product_id != null ? String(row.product_id) : '',
        qty,
        unit_price: qty > 0 ? Math.round(totalAmount / qty) : totalAmount,
        item_amount: totalAmount,
        snapshot_name: row.product_name || '',
        snapshot_spec: '',
        snapshot_image: ''
      }],
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  });
}

function normalizeRefunds(refunds, users) {
  const userMap = new Map(users.map((user) => [user._legacy_id, user.openid]));
  return refunds.map((row) => ({
    _id: row._id || `refund-${row.id}`,
    _legacy_id: row.id || null,
    openid: row.openid || row.user_id || userMap.get(row.user_id) || '',
    order_id: row.order_id ? String(row.order_id) : '',
    order_no: row.order_no || '',
    amount: centsFromYuan(row.amount),
    reason: row.reason || '',
    images: toArray(row.images),
    status: row.status || 'pending',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeReviews(reviews, users) {
  const userMap = new Map(users.map((user) => [user._legacy_id, user.openid]));
  return reviews.map((row) => ({
    _id: row._id || `review-${row.id}`,
    _legacy_id: row.id || null,
    openid: row.openid || row.user_id || userMap.get(row.user_id) || '',
    order_id: row.order_id ? String(row.order_id) : '',
    product_id: row.product_id ? String(row.product_id) : '',
    rating: toNumber(row.rating, 5),
    content: row.content || '',
    images: toArray(row.images),
    status: toNumber(row.status, 1),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeCommissions(rows) {
  return rows.map((row) => ({
    _id: row._id || `commission-${row.id}`,
    _legacy_id: row.id || null,
    order_id: row.order_id ? String(row.order_id) : '',
    order_no: row.order_no || '',
    amount: centsFromYuan(row.amount),
    status: row.status || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeWithdrawals(rows, users) {
  const userMap = new Map(users.map((user) => [user._legacy_id, user.openid]));
  return rows.map((row) => ({
    _id: row._id || `withdrawal-${row.id}`,
    _legacy_id: row.id || null,
    openid: row.openid || row.user_id || userMap.get(row.user_id) || '',
    amount: centsFromYuan(row.amount),
    status: row.status || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeBanners(rows) {
  return rows.map((row) => ({
    _id: row._id || `banner-${row.id}`,
    _legacy_id: row.id || null,
    title: row.title || '',
    subtitle: row.subtitle || row.kicker || '',
    image_url: row.image_url || '',
    link_type: row.link_type || 'none',
    link_value: String(row.link_value || row.product_id || ''),
    position: row.position || 'home',
    sort_order: toNumber(row.sort_order, 0),
    status: toBoolean(row.status),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeMaterials(rows) {
  return rows.map((row) => ({
    _id: row._id || `material-${row.id}`,
    _legacy_id: row.id || null,
    file_id: row.file_id || '',
    temp_url: row.url || '',
    group_id: row.group_id != null ? String(row.group_id) : '',
    name: row.title || '',
    mime_type: row.mime_type || '',
    usage_type: row.type || 'image',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeMaterialGroups(rows) {
  return rows.map((row) => ({
    _id: row._id || `material-group-${row.id}`,
    _legacy_id: row.id || null,
    name: row.name || '',
    code: row.code || '',
    sort_order: toNumber(row.sort_order, 0),
    status: toBoolean(row.status),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeAdmins(rows) {
  return rows.map((row) => ({
    _id: row._id || String(row.id || `admin-${row.username}`),
    id: row.id || null,
    _legacy_id: row.id || null,
    username: row.username || '',
    name: row.name || '',
    role: row.role || '',
    password_hash: row.password_hash || '',
    salt: row.salt || '',
    permissions: row.permissions || null,
    phone: row.phone || '',
    email: row.email || '',
    last_login_at: row.last_login_at || null,
    last_login_ip: row.last_login_ip || '',
    status: toBoolean(row.status),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  }));
}

function normalizeAdminRoles(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const role = row.role || 'operator';
    if (map.has(role)) return;
    map.set(role, {
      _id: role,
      code: role,
      name: role,
      permissions: typeof row.permissions === 'string' ? (() => {
        try { return JSON.parse(row.permissions); } catch (_) { return []; }
      })() : []
    });
  });
  return Array.from(map.values());
}

function run() {
  const rawUsers = readJsonl('users');
  const rawProducts = readJsonl('products');
  const rawSkus = readJsonl('skus');
  const normalizedUsers = normalizeUsers(rawUsers);
  const normalizedSkus = rawSkus.length ? normalizeSkus(rawSkus) : buildFallbackSkusFromProducts(rawProducts);

  writeJson('users', normalizedUsers);
  writeJson('categories', normalizeCategories(readJsonl('categories')));
  writeJson('products', normalizeProducts(rawProducts));
  writeJson('skus', normalizedSkus);
  writeJson('cart_items', normalizeCartItems(readJsonl('cart_items'), normalizedUsers));
  writeJson('orders', normalizeOrders(readJsonl('orders'), normalizedUsers));
  writeJson('refunds', normalizeRefunds(readJsonl('refunds'), normalizedUsers));
  writeJson('reviews', normalizeReviews(readJsonl('reviews'), normalizedUsers));
  writeJson('commissions', normalizeCommissions(readJsonl('commissions')));
  writeJson('withdrawals', normalizeWithdrawals(readJsonl('withdrawals'), normalizedUsers));
  writeJson('banners', normalizeBanners(readJsonl('banners')));
  writeJson('materials', normalizeMaterials(readJsonl('materials')));
  writeJson('material_groups', normalizeMaterialGroups(readJsonl('material_groups')));
  writeJson('admins', normalizeAdmins(readJsonl('admins')));
  writeJson('admin_roles', normalizeAdminRoles(readJsonl('admins')));

  const summary = {
    users: normalizedUsers.length,
    categories: readJsonl('categories').length,
    products: rawProducts.length,
    skus: normalizedSkus.length,
    orders: readJsonl('orders').length
  };

  writeJson('_summary', summary);
  console.log(`Normalized seed written to ${targetRoot}`);
  console.log(summary);
}

run();
