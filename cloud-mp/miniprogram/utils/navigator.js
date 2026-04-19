/**
 * navigator.js — 统一跳转工具
 *
 * 将 link_type + link_value 映射为小程序导航动作，
 * 可在首页 banner、分类页、活动页等任意位置复用。
 *
 * link_type 支持：
 *   none        → 不跳转
 *   product     → link_value = 商品ID，跳转商品详情
 *   activity    → 跳转活动 Tab
 *   group_buy   → 跳转拼团列表页（可携带 activity_id）
 *   slash       → 跳转砍价列表页（可携带 activity_id）
 *   lottery     → 跳转抽奖页（预留奖池ID）
 *   flash_sale  → 限时秒杀（limited-spot，link_value 可为活动 id 或 __flash_sale__）
 *   coupon_center → 优惠券列表 /pages/coupon/list
 *   page        → link_value = 小程序页面路径（自动判断 tabBar / 子页）
 *   url         → link_value = 外部网址，在 webview 中打开
 *   category    → link_value = 分类 ID，打开分类 Tab 并滚动到该分类（switchTab 无 query，用本地存储传递）
 */

const {
    TAB_PAGES,
    stripQuery,
    isValidPagePath,
    normalizeTargetLinkValue
} = require('./miniProgramTargets');

/**
 * 执行跳转
 * @param {string} linkType
 * @param {string|number} linkValue
 */
function navigate(linkType, linkValue) {
    if (!linkType || linkType === 'none') return;
    const normalizedValue = normalizeTargetLinkValue(linkType, linkValue);

    switch (linkType) {
        case 'product':
            if (normalizedValue) {
                wx.navigateTo({ url: `/pages/product/detail?id=${normalizedValue}` });
            }
            break;

        case 'activity':
            wx.switchTab({ url: '/pages/activity/activity' });
            break;

        case 'category':
            if (normalizedValue != null && String(normalizedValue).trim() !== '') {
                try {
                    wx.setStorageSync('category_focus_id', String(normalizedValue).trim());
                } catch (e) {
                    console.warn('[navigator] category_focus_id 写入失败', e);
                }
            }
            wx.switchTab({ url: '/pages/category/category' });
            break;

        case 'group_buy':
            wx.navigateTo({
                url: normalizedValue ? `/pages/group/list?activity_id=${normalizedValue}` : '/pages/group/list'
            });
            break;

        case 'slash':
            wx.navigateTo({
                url: normalizedValue ? `/pages/slash/list?activity_id=${normalizedValue}` : '/pages/slash/list'
            });
            break;

        case 'lottery':
            wx.navigateTo({
                url: normalizedValue ? `/pages/lottery/lottery?pool_id=${normalizedValue}` : '/pages/lottery/lottery'
            });
            break;

        case 'flash_sale': {
            const slotId = String(normalizedValue || '').trim();
            if (!slotId) {
                wx.navigateTo({ url: '/pages/activity/limited-spot' });
            } else {
                wx.navigateTo({ url: `/pages/activity/limited-spot?slot_id=${encodeURIComponent(slotId)}` });
            }
            break;
        }

        case 'coupon_center':
            wx.navigateTo({ url: '/pages/coupon/center' });
            break;

        case 'page':
            if (normalizedValue) {
                if (!isValidPagePath(String(normalizedValue))) {
                    console.warn('[navigator] page 路径不在白名单内，已阻止跳转:', normalizedValue);
                    wx.showToast({ title: '页面未开放跳转', icon: 'none' });
                    break;
                }
                const targetPath = String(normalizedValue);
                const tabPath = stripQuery(targetPath);
                if (TAB_PAGES.includes(tabPath)) {
                    wx.switchTab({ url: tabPath });
                } else {
                    wx.navigateTo({ url: targetPath });
                }
            }
            break;

        case 'url':
            if (normalizedValue) {
                wx.setClipboardData({
                    data: String(normalizedValue),
                    success: () => {
                        wx.showToast({ title: '链接已复制，请在浏览器打开', icon: 'none' });
                    }
                });
            }
            break;

        default:
            console.warn('[navigator] 未知 link_type:', linkType);
            break;
    }
}

/**
 * 从 tap 事件中提取 item 并跳转（快捷方式）
 * 用法：bindtap="onNavTap" data-item="{{item}}"
 *       + onNavTap: navigator.onTap
 */
function onTap(e) {
    const item = e.currentTarget.dataset.item || {};
    navigate(item.link_type, item.link_value);
}

/**
 * 安全返回：优先 navigateBack，导航栈不足时 fallback 到首页
 * @param {string} [fallbackUrl] 自定义兜底页面，默认首页
 */
function safeBack(fallbackUrl) {
    const pages = getCurrentPages();
    if (pages.length > 1) {
        wx.navigateBack();
    } else {
        const target = fallbackUrl || '/pages/index/index';
        if (TAB_PAGES.includes(target)) {
            wx.switchTab({ url: target });
        } else {
            wx.redirectTo({ url: target });
        }
    }
}

module.exports = { navigate, onTap, safeBack, TAB_PAGES, isValidPagePath };
