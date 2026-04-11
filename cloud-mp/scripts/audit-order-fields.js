const fs = require('fs');
const path = require('path');

function readJson(relativePath) {
  const filePath = path.join(__dirname, '..', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isMissing(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function countMissing(rows, fields) {
  return Object.fromEntries(
    fields.map((field) => [field, rows.filter((row) => isMissing(row[field])).length])
  );
}

function collectFields(rows) {
  const fields = new Set();
  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => fields.add(key));
  });
  return [...fields].sort();
}

const orders = readJson('cloudbase-seed/orders.json');
const products = readJson('cloudbase-seed/products.json');
const skus = readJson('cloudbase-seed/skus.json');
const orderItems = orders.flatMap((order) => (Array.isArray(order.items) ? order.items : []));

const orderRequiredFields = [
  'order_no',
  'status',
  'items',
  'total_amount',
  'pay_amount',
  'address_snapshot',
  'delivery_type',
  'created_at',
  'updated_at'
];

const orderDerivedOrOptionalFields = [
  'address',
  'product',
  'product_id',
  'sku',
  'quantity',
  'tracking_no',
  'logistics_company',
  'actual_price',
  'coupon_discount',
  'points_discount',
  'points_used',
  'paid_at',
  'shipped_at',
  'completed_at',
  'confirmed_at',
  'cancelled_at',
  'expire_at',
  'reviewed',
  'fulfillment_type'
];

const orderItemBaseFields = ['product_id', 'qty', 'unit_price', 'item_amount'];
const orderItemSnapshotFields = ['sku_id', 'snapshot_name', 'snapshot_image', 'snapshot_spec'];

const productFieldsToCheck = ['name', 'images', 'min_price', 'status', 'stock'];
const skuFieldsToCheck = ['product_id', 'spec', 'price', 'image', 'stock'];

const report = {
  generated_at: new Date().toISOString(),
  collections: {
    orders: {
      count: orders.length,
      fields: collectFields(orders),
      missing_required: countMissing(orders, orderRequiredFields),
      missing_derived_or_optional: countMissing(orders, orderDerivedOrOptionalFields)
    },
    order_items: {
      count: orderItems.length,
      fields: collectFields(orderItems),
      missing_base: countMissing(orderItems, orderItemBaseFields),
      missing_snapshot: countMissing(orderItems, orderItemSnapshotFields)
    },
    products: {
      count: products.length,
      fields: collectFields(products),
      missing_key_fields: countMissing(products, productFieldsToCheck)
    },
    skus: {
      count: skus.length,
      fields: collectFields(skus),
      missing_key_fields: countMissing(skus, skuFieldsToCheck)
    }
  },
  conclusions: [
    'orders.items 基础字段完整，但商品快照字段在 seed 中整体缺失。',
    'products/skus 的名称、图片、规格和价格字段齐全，可作为订单展示兜底来源。',
    '订单展示层如果只依赖历史订单快照，会出现商品名、图片、规格丢失。'
  ]
};

console.log(JSON.stringify(report, null, 2));
