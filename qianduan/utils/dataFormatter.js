/**
 * 数据格式化工具函数
 * 解决图片解析、价格计算等重复代码问题
 */

import { USER_ROLES } from '../config/constants.js';

/**
 * 解析图片字段（统一处理字符串 JSON 和数组）
 * @param {string|Array} images - 图片数据
 * @returns {Array} 图片数组
 */
export function parseImages(images) {
  if (!images) return [];

  if (Array.isArray(images)) {
    return images;
  }

  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      // 如果解析失败，当作单个 URL
      return [images];
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
export function getFirstImage(images, defaultImg = '/assets/images/placeholder.svg') {
  const imageList = parseImages(images);
  return imageList.length > 0 ? imageList[0] : defaultImg;
}

/**
 * 根据用户角色计算商品价格
 * @param {Object} product - 商品对象
 * @param {Object} sku - SKU 对象（可选）
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
export function calculatePrice(product, sku = null, roleLevel = USER_ROLES.GUEST) {
  if (!product) return 0;

  // 如果有 SKU，优先使用 SKU 价格
  if (sku) {
    return calculateSkuPrice(sku, roleLevel);
  }

  // 使用商品价格
  return calculateProductPrice(product, roleLevel);
}

/**
 * 计算 SKU 价格
 * @param {Object} sku - SKU 对象
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
function calculateSkuPrice(sku, roleLevel) {
  const priceMap = {
    [USER_ROLES.GUEST]: sku.retail_price,
    [USER_ROLES.MEMBER]: sku.member_price || sku.retail_price,
    [USER_ROLES.LEADER]: sku.wholesale_price || sku.member_price || sku.retail_price,
    [USER_ROLES.AGENT]: sku.wholesale_price || sku.member_price || sku.retail_price
  };

  return parseFloat(priceMap[roleLevel] || sku.retail_price || 0);
}

/**
 * 计算商品价格
 * @param {Object} product - 商品对象
 * @param {number} roleLevel - 用户角色等级
 * @returns {number} 价格
 */
function calculateProductPrice(product, roleLevel) {
  const priceMap = {
    [USER_ROLES.GUEST]: product.retail_price,
    [USER_ROLES.MEMBER]: product.price_member || product.retail_price,
    [USER_ROLES.LEADER]: product.price_leader || product.price_member || product.retail_price,
    [USER_ROLES.AGENT]: product.price_agent || product.price_leader || product.price_member || product.retail_price
  };

  return parseFloat(priceMap[roleLevel] || product.retail_price || 0);
}

/**
 * 格式化金额（保留两位小数）
 * @param {number} amount - 金额
 * @returns {string} 格式化后的金额
 */
export function formatMoney(amount) {
  if (isNaN(amount)) return '0.00';
  return Number(amount).toFixed(2);
}

/**
 * 格式化数字（千分位）
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字
 */
export function formatNumber(num) {
  if (isNaN(num)) return '0';
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 格式化时间
 * @param {string|number|Date} timestamp - 时间戳或时间字符串
 * @param {string} format - 格式化模板
 * @returns {string} 格式化后的时间
 */
export function formatTime(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
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
export function formatRelativeTime(timestamp) {
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
export function processProduct(product, roleLevel = USER_ROLES.GUEST) {
  if (!product) return null;

  return {
    ...product,
    images: parseImages(product.images),
    firstImage: getFirstImage(product.images),
    displayPrice: formatMoney(calculatePrice(product, null, roleLevel)),
    formattedRetailPrice: formatMoney(product.retail_price || 0)
  };
}

/**
 * 批量处理商品列表
 * @param {Array} products - 商品列表
 * @param {number} roleLevel - 用户角色等级
 * @returns {Array} 处理后的商品列表
 */
export function processProducts(products, roleLevel = USER_ROLES.GUEST) {
  if (!Array.isArray(products)) return [];
  return products.map(product => processProduct(product, roleLevel));
}
