/**
 * 数据格式化工具函数
 * 解决图片解析、价格计算等重复代码问题
 */

const { USER_ROLES } = require('../config/constants.js');
const { getApiBaseUrl } = require('../config/env');

function getAssetFromConfig(key, fallback) {
  try {
    const app = getApp();
    return app?.globalData?.miniProgramConfig?.asset_map?.[key] || fallback;
  } catch (_) {
    return fallback;
  }
}

function extractAssetValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return String(value.url || value.image_url || value.temp_url || value.file_id || value.image || '').trim();
  }
  return '';
}

function normalizeAssetUrl(value) {
  const raw = extractAssetValue(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    if (isExpiredSignedAssetUrl(raw)) return '';
    return raw;
  }
  if (/^cloud:\/\//i.test(raw) || /^wxfile:\/\//i.test(raw) || /^data:/i.test(raw)) {
    return raw;
  }
  if (raw.startsWith('//')) return `https:${raw}`;
  const apiBase = getApiBaseUrl().replace(/\/api\/?$/, '');
  if (raw.startsWith('/')) {
    return apiBase ? `${apiBase}${raw}` : raw;
  }
  if (/^(uploads|assets)\//i.test(raw)) {
    const normalizedPath = `/${raw.replace(/^\/+/, '')}`;
    return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
  }
  return raw;
}

function parseSignedAssetExpireAt(url) {
  const text = String(url || '').trim();
  if (!/^https?:\/\//i.test(text)) return 0;
  const match = text.match(/[?&]t=(\d{10,13})\b/i);
  if (!match) return 0;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1e12 ? raw : raw * 1000;
}

function isExpiredSignedAssetUrl(url) {
  const text = String(url || '').trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (!/[?&]sign=/.test(text)) return false;
  const expireAt = parseSignedAssetExpireAt(text);
  return expireAt > 0 && expireAt <= Date.now();
}

function isTemporarySignedAssetUrl(url) {
  const text = String(url || '').trim();
  if (!/^https?:\/\//i.test(text)) return false;
  if (/[?&](expires|signature|sign|x-amz-algorithm|x-amz-credential|x-amz-date|x-amz-expires|x-amz-security-token|x-amz-signature|x-oss-signature|x-oss-credential|x-oss-date|x-oss-expires|x-cos-algorithm|x-cos-credential|x-cos-date|x-cos-expires|x-cos-security-token|x-cos-signature)=/i.test(text)) {
    return true;
  }
  return /tcb\.qcloud\.la/i.test(text) && /[?&]sign=/i.test(text) && /[?&]t=/i.test(text);
}

/**
 * OSS 图片处理：自动附加 WebP 压缩 + 缩放参数
 * 只对阿里云 OSS 域名（.aliyuncs.com）生效，其他 URL 原样返回
 * @param {string} url - 原始图片 URL
 * @param {number} width - 目标宽度（px），默认 750
 * @param {number} quality - 压缩质量 1-100，默认 75
 * @returns {string} 处理后的 URL
 */
function toOssUrl(url, width = 750, quality = 75) {
  if (!url || typeof url !== 'string') return url;
  // 跳过本地路径、data URL、非 OSS 域名
  if (url.startsWith('/') || url.startsWith('data:')) return url;
  const ossReg = /\.aliyuncs\.com/;
  if (!ossReg.test(url)) return url;
  // 移除已有的处理参数，避免重复叠加
  const baseUrl = url.split('?')[0];
  return `${baseUrl}?x-oss-process=image/format,webp/quality,q_${quality}/resize,m_lfit,w_${width}`;
}

/**
 * 解析图片字段（统一处理字符串 JSON 和数组）
 * @param {string|Array} images - 图片数据
 * @returns {Array} 图片数组
 */
function parseImages(images) {
  if (!images) return [];

  if (Array.isArray(images)) {
    return images.map((item) => normalizeAssetUrl(item)).filter(Boolean);
  }

  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.map((item) => normalizeAssetUrl(item)).filter(Boolean);
    } catch (e) {
      // 如果解析失败，当作单个 URL
      const single = normalizeAssetUrl(images);
      return single ? [single] : [];
    }
  }

  return [];
}

/**
 * 获取第一张图片或默认图
 * @param {string|Array} images - 图片数据
 * @param {string} defaultImg - 默认图片
 * @returns {string} 图片 URL
 */
function getFirstImage(images, defaultImg = getAssetFromConfig('default_product_image', '/assets/images/placeholder.svg')) {
  const imageList = parseImages(images);
  return imageList.length > 0 ? imageList[0] : defaultImg;
}

function normalizePriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric >= 1000 ? numeric / 100 : numeric;
}

function hasSelectableSkuSpec(sku) {
  if (!sku || typeof sku !== 'object') return false;
  if (Array.isArray(sku.specs) && sku.specs.length > 0) {
    return sku.specs.some((item) => item && item.name && item.value);
  }
  return !!(sku.spec_name && sku.spec_value);
}

function pickText(value, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function dedupeTextList(list = []) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter((item) => {
    const text = pickText(item);
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
}

function getSkuSpecEntries(sku = {}) {
  if (!sku || typeof sku !== 'object') return [];

  if (Array.isArray(sku.specs) && sku.specs.length > 0) {
    return sku.specs
      .map((item) => ({
        name: pickText(item && (item.name || item.key || item.label)),
        value: pickText(item && (item.value || item.text || item.label_value))
      }))
      .filter((item) => item.name && item.value);
  }

  if (sku.specs && typeof sku.specs === 'object') {
    return Object.keys(sku.specs)
      .map((name) => ({
        name: pickText(name),
        value: pickText(sku.specs[name])
      }))
      .filter((item) => item.name && item.value);
  }

  const specName = pickText(sku.spec_name || sku.specName);
  const specValue = pickText(sku.spec_value || sku.specValue);
  if (specName && specValue) {
    return [{ name: specName, value: specValue }];
  }

  return [];
}

function buildSkuValueText(sku = {}, fallback = '') {
  const values = dedupeTextList(getSkuSpecEntries(sku).map((item) => item.value));
  if (values.length > 0) return values.join(' / ');
  return pickText(sku.spec_value || sku.specValue || sku.spec || sku.name, fallback);
}

function buildProductSpecSummary(skus = []) {
  const specMap = {};
  (Array.isArray(skus) ? skus : []).forEach((sku) => {
    getSkuSpecEntries(sku).forEach((entry) => {
      if (!entry.name || !entry.value) return;
      if (!specMap[entry.name]) {
        specMap[entry.name] = new Set();
      }
      specMap[entry.name].add(entry.value);
    });
  });

  return Object.keys(specMap)
    .map((name) => Array.from(specMap[name]).join('/'))
    .join(' · ');
}

function findProductDefaultSku(product = {}, skus = []) {
  const safeSkus = Array.isArray(skus) ? skus.filter(Boolean) : [];
  if (!safeSkus.length) return null;

  const defaultSkuId = pickText(
    product.default_sku_id
    || product.defaultSkuId
    || product.default_sku
    || product.defaultSku
  );
  if (defaultSkuId) {
    const matched = safeSkus.find((sku) => {
      const skuId = pickText(sku.id || sku._id || sku.sku_id || sku.skuId);
      return skuId && skuId === defaultSkuId;
    });
    if (matched) return matched;
  }

  const flagged = safeSkus.find((sku) => (
    sku.is_default === true
    || sku.default === true
    || sku.isDefault === true
    || sku.is_default === 1
    || sku.default === 1
  ));
  if (flagged) return flagged;

  if (safeSkus.length === 1) return safeSkus[0];
  return null;
}

function resolveProductInitialSku(product = {}, skus = [], roleLevel = USER_ROLES.GUEST) {
  void roleLevel;
  const safeSkus = Array.isArray(skus) ? skus.filter(Boolean) : [];
  if (!safeSkus.length) return null;

  const defaultSku = findProductDefaultSku(product, safeSkus);
  if (defaultSku) return defaultSku;

  const inStockSku = safeSkus.find((sku) => Number(sku.stock || 0) > 0);
  return inStockSku || safeSkus[0];
}

function resolveProductDefaultSpecText(product = {}, skus = []) {
  const explicitText = pickText(product.default_spec_text || product.defaultSpecText || product.spec_text || product.specText);
  if (explicitText) return explicitText;

  const defaultSku = findProductDefaultSku(product, skus);
  if (defaultSku) {
    const defaultSkuText = buildSkuValueText(defaultSku, '');
    if (defaultSkuText) return defaultSkuText;
  }

  if (Array.isArray(skus) && skus.length === 1) {
    return buildSkuValueText(skus[0], '');
  }

  return '';
}

function resolveProductImage(product, fallback = getAssetFromConfig('default_product_image', '/assets/images/placeholder.svg')) {
  if (!product || typeof product !== 'object') return fallback;

  const candidates = [
    getFirstImage(product.images),
    product.file_id,
    product.fileId,
    product.image,
    product.image_url,
    product.cover_image,
    product.coverImage
  ];

  if (Array.isArray(product.skus)) {
    const skuImage = product.skus.find((sku) => sku && (sku.image || sku.file_id || sku.fileId));
    if (skuImage) {
      candidates.push(skuImage.file_id, skuImage.fileId, skuImage.image);
    }
  }

  const resolved = candidates
    .map((item) => normalizeAssetUrl(item))
    .find(Boolean);
  return resolved || normalizeAssetUrl(fallback) || fallback;
}

function resolveProductDisplayPrice(product, roleLevel = USER_ROLES.GUEST) {
  if (!product) return 0;

  const candidates = [
    product.displayPrice,
    calculatePrice(product, null, roleLevel),
    product.retail_price,
    product.price,
    product.min_price
  ];

  for (const candidate of candidates) {
    const normalized = normalizePriceValue(candidate);
    if (normalized != null) return normalized;
  }

  return 0;
}

function resolveProductCurrentPrice(product, sku = null, roleLevel = USER_ROLES.GUEST) {
  const productPrice = resolveProductDisplayPrice(product, roleLevel);
  if (!sku) return productPrice;

  if (hasSelectableSkuSpec(sku)) {
    const candidates = [
      calculatePrice(product, sku, roleLevel),
      sku.displayPrice,
      sku.retail_price,
      sku.price
    ];

    for (const candidate of candidates) {
      const normalized = normalizePriceValue(candidate);
      if (normalized != null) return normalized;
    }
  }

  if (productPrice > 0) return productPrice;

  const fallbackSkuPrice = normalizePriceValue(sku.displayPrice ?? sku.retail_price ?? sku.price);
  return fallbackSkuPrice != null ? fallbackSkuPrice : 0;
}

/**
 * 统一计算商品价格（不区分角色）
 * @param {Object} product - 商品对象
 * @param {Object} sku - SKU 对象（可选）
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
function calculatePrice(product, sku = null, roleLevel = USER_ROLES.GUEST) {
  if (!product) return 0;

  // 如果有 SKU，优先使用 SKU 价格
  if (sku) {
    return calculateSkuPrice(sku, roleLevel);
  }

  // 使用商品价格
  return calculateProductPrice(product, roleLevel);
}

/**
 * 计算 SKU 价格（统一按标价）
 * @param {Object} sku - SKU 对象
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
function calculateSkuPrice(sku, roleLevel) {
  void roleLevel;
  const rawFallbackPrice = sku.retail_price != null && sku.retail_price !== ''
    ? sku.retail_price
    : (sku.price != null && sku.price !== '' ? (Number(sku.price) >= 1000 ? Number(sku.price) / 100 : sku.price) : 0);
  return parseFloat(rawFallbackPrice || 0);
}

/**
 * 计算商品价格（统一按标价）
 * @param {Object} product - 商品对象
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
function calculateProductPrice(product, roleLevel) {
  void roleLevel;
  return parseFloat(product.retail_price || product.price || 0);
}

/**
 * 格式化金额（保留两位小数）
 * @param {number} amount - 金额
 * @returns {string} 格式化后的金额
 */
function formatMoney(amount) {
  if (isNaN(amount)) return '0.00';
  return Number(amount).toFixed(2);
}

/**
 * 格式化数字（千分位）
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字
 */
function formatNumber(num) {
  if (isNaN(num)) return '0';
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化时间
 * @param {string|number|Date} timestamp - 时间戳或时间字符串
 * @param {string} format - 格式化模板
 * @returns {string} 格式化后的时间
 */
function formatTime(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const map = {
    'YYYY': date.getFullYear(),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'DD': String(date.getDate()).padStart(2, '0'),
    'HH': String(date.getHours()).padStart(2, '0'),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'ss': String(date.getSeconds()).padStart(2, '0')
  };

  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, matched => map[matched]);
}

/**
 * 格式化相对时间（刚刚、几分钟前等）
 * @param {string|number|Date} timestamp - 时间戳
 * @returns {string} 相对时间文本
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return formatTime(timestamp, 'MM-DD');
}

/**
 * 处理商品数据（解析图片、计算价格）
 * @param {Object} product - 原始商品对象
 * @param {number} roleLevel - 用户角色等级
 * @returns {Object} 处理后的商品对象
 */
function processProduct(product, roleLevel = USER_ROLES.GUEST) {
  if (!product) return null;

  const rawFirstImage = getFirstImage(product.images || product.image);

  // 生成规格摘要（用于商品卡片和列表展示）
  let specSummary = '';
  if (product.skus && product.skus.length > 0) {
    const specMap = {};
    product.skus.forEach((sku) => {
      const skuSpecs = Array.isArray(sku.specs) && sku.specs.length > 0
        ? sku.specs
        : (sku.spec_name && sku.spec_value ? [{ name: sku.spec_name, value: sku.spec_value }] : []);
      skuSpecs.forEach((s) => {
        if (s.name && s.value) {
          if (!specMap[s.name]) specMap[s.name] = new Set();
          specMap[s.name].add(s.value);
        }
      });
    });
    specSummary = Object.keys(specMap).map((name) => Array.from(specMap[name]).join('/')).join(' · ');
  }

  return {
    ...product,
    images: parseImages(product.images),
    firstImage: toOssUrl(rawFirstImage, 400), // 列表卡片宽度按 400 处理
    displayPrice: formatMoney(calculatePrice(product, null, roleLevel)),
    formattedRetailPrice: formatMoney(product.retail_price || 0),
    specSummary
  };
}

/**
 * 批量处理商品列表
 * @param {Array} products - 商品列表
 * @param {number} roleLevel - 用户角色等级
 * @returns {Array} 处理后的商品列表
 */
function processProducts(products, roleLevel = USER_ROLES.GUEST) {
  if (!Array.isArray(products)) return [];
  return products.map(product => processProduct(product, roleLevel));
}

/**
 * 标准化商品ID（支持 p123 格式和纯数字字符串）
 * @param {string|number} id
 * @returns {number|string} 标准化后的ID
 */
function normalizeProductId(id) {
  if (id === null || id === undefined) return id;
  if (typeof id === 'string') {
    const m = id.match(/^p(\d+)$/i);
    if (m) return Number(m[1]);
    if (/^\d+$/.test(id)) return Number(id);
  }
  return id;
}

/**
 * 生成商品热度标签文字
 * @param {Object} product - 商品对象（含 purchase_count/sales_count/view_count/heat_score 字段）
 * @returns {string} 热度标签，无数据时返回空字符串
 */
function genHeatLabel(product) {
  const sales = Number(product.purchase_count || product.sales_count || 0);
  const views = Number(product.view_count || 0);
  const heat = Number(product.heat_score || 0);

  if (sales >= 1000) return `已售${Math.floor(sales / 1000)}k+件`;
  if (sales >= 100) return `已售${sales}+件`;
  if (sales >= 10) return `${sales}人已购`;

  if (views >= 1000) return `${Math.floor(views / 100) / 10}k人想买`;
  if (views >= 100) return `${views}人浏览`;

  if (heat >= 500) return '热卖中';
  if (heat >= 100) return '人气好物';

  return '';
}

// CommonJS 导出（WeChat Mini Program 兼容）
module.exports = {
  toOssUrl,
  parseImages,
  getFirstImage,
  normalizeAssetUrl,
  isTemporarySignedAssetUrl,
  normalizePriceValue,
  getSkuSpecEntries,
  buildSkuValueText,
  buildProductSpecSummary,
  findProductDefaultSku,
  resolveProductInitialSku,
  resolveProductDefaultSpecText,
  resolveProductImage,
  resolveProductDisplayPrice,
  resolveProductCurrentPrice,
  calculatePrice,
  formatMoney,
  formatNumber,
  formatTime,
  formatRelativeTime,
  processProduct,
  processProducts,
  normalizeProductId,
  genHeatLabel
};
