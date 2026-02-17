# 前端用户行为追踪集成指南
# Frontend User Behavior Tracking Integration Guide

> **项目**: S2B2C 数字化代理商分销系统 - 微信小程序端
> **目标**: 实现全链路用户行为追踪、转化漏斗分析、业务指标监控
> **创建时间**: 2025-02-12

---

## 📊 现状分析 (Current State Analysis)

### 已有基础设施
- ✅ **统一请求封装** (`qianduan/utils/request.js`)
  - 请求/响应拦截器机制
  - 自动重试和防重复请求
  - 统一错误处理

- ✅ **错误处理工具** (`qianduan/utils/errorHandler.js`)
  - 标准化错误日志
  - 错误码映射
  - 但缺少远程上报机制（注释提示：`// 这里可以集成第三方日志服务`）

- ✅ **用户身份管理**
  - Token + OpenID 双重标识
  - 用户角色分级 (普通用户/团长/代理商/合伙人)
  - 邀请码追踪机制

### 缺失能力
- ❌ **无用户行为埋点**: 没有页面访问、点击、停留时长等基础埋点
- ❌ **无转化漏斗追踪**: 无法分析注册→浏览→加购→下单→支付全链路
- ❌ **无分销效果分析**: 无法追踪分享来源、邀请转化、代理商拉新效果
- ❌ **无性能监控**: 页面加载时间、接口响应时间未记录
- ❌ **无实时监控**: 异常行为、高价值用户行为无法实时触达运营团队

---

## 🎯 追踪方案设计

### 方案A: 神策数据 (Sensors Analytics) 【推荐】

**优势**:
- ✅ 专为中国市场设计，符合数据合规要求
- ✅ 完善的微信小程序 SDK，开箱即用
- ✅ 强大的用户分群、漏斗分析、留存分析能力
- ✅ 支持实时事件触发（如高价值用户行为实时通知）
- ✅ 可视化埋点工具，无需重新发版

**成本**:
- 基础版: ¥15,000/年 (支持 50万 MAU)
- 标准版: ¥40,000/年 (支持 200万 MAU + 高级分析)

**集成步骤**:

#### 1. 安装 SDK
```bash
# 在 qianduan/ 目录下
npm install sa-sdk-miniprogram --save
```

#### 2. 创建追踪工具 `qianduan/utils/tracker.js`
```javascript
/**
 * 神策数据追踪工具
 * 统一管理所有埋点事件
 */
const sensors = require('sa-sdk-miniprogram');
const { USER_ROLES } = require('../config/constants');

// 初始化神策 SDK
sensors.init({
  server_url: 'https://your-sensors-server.com/sa?project=s2b2c',
  // 全埋点配置
  autoTrack: {
    appLaunch: true,      // 小程序启动
    appShow: true,        // 小程序显示
    appHide: true,        // 小程序隐藏
    pageShow: true,       // 页面显示
    pageShare: true,      // 页面分享
    mpClick: true         // 元素点击（需在 WXML 中添加 sensors-data 属性）
  },
  // 公共属性
  preset_properties: {
    latest_scene: true,           // 场景值
    latest_share_info: true,      // 分享信息
    latest_utm: true              // UTM 参数
  }
});

/**
 * 设置用户属性（登录成功后调用）
 */
function setUserProfile(userInfo) {
  const roleNames = {
    [USER_ROLES.GUEST]: '游客',
    [USER_ROLES.MEMBER]: '普通会员',
    [USER_ROLES.LEADER]: '团长',
    [USER_ROLES.AGENT]: '代理商',
    [USER_ROLES.PARTNER]: '合伙人'
  };

  sensors.login(String(userInfo.id));
  sensors.setProfile({
    name: userInfo.nickname || '未知',
    avatar: userInfo.avatar || '',
    mobile: userInfo.mobile || '',
    role: roleNames[userInfo.role_level] || '游客',
    role_level: userInfo.role_level,
    parent_id: userInfo.parent_id || null,
    balance: parseFloat(userInfo.balance || 0),
    commission_balance: parseFloat(userInfo.commission_balance || 0),
    total_order_amount: parseFloat(userInfo.total_order_amount || 0),
    total_order_count: parseInt(userInfo.total_order_count || 0),
    registered_at: userInfo.created_at
  });
}

/**
 * 登出（清除用户标识）
 */
function logout() {
  sensors.logout();
}

/**
 * 追踪自定义事件
 */
function track(eventName, properties = {}) {
  // 自动添加时间戳
  sensors.track(eventName, {
    ...properties,
    tracked_at: new Date().toISOString()
  });
}

/**
 * 追踪页面浏览
 */
function trackPageView(pageName, properties = {}) {
  sensors.track('$MPViewScreen', {
    $title: pageName,
    ...properties
  });
}

// ========== 业务事件追踪 ==========

/**
 * 商品浏览
 */
function trackViewProduct(product, fromPage = '') {
  track('ViewProduct', {
    product_id: product.id,
    product_name: product.name,
    product_price: parseFloat(product.retail_price),
    category_id: product.category_id,
    category_name: product.category_name,
    from_page: fromPage,
    is_stock_sufficient: product.stock > 0
  });
}

/**
 * 加入购物车
 */
function trackAddToCart(product, sku, quantity) {
  track('AddToCart', {
    product_id: product.id,
    product_name: product.name,
    sku_id: sku ? sku.id : null,
    sku_name: sku ? `${sku.spec_name}: ${sku.spec_value}` : '无规格',
    quantity: quantity,
    unit_price: parseFloat(sku ? sku.retail_price : product.retail_price),
    total_price: parseFloat((sku ? sku.retail_price : product.retail_price) * quantity)
  });
}

/**
 * 下单
 */
function trackCreateOrder(order, products) {
  track('CreateOrder', {
    order_id: order.order_id,
    order_amount: parseFloat(order.total_price),
    product_count: products.length,
    product_ids: products.map(p => p.product_id).join(','),
    fulfillment_type: order.fulfillment_type, // 'self' 或 'supplier'
    distributor_id: order.distributor_id || null,
    payment_method: order.payment_method
  });
}

/**
 * 支付成功
 */
function trackPaymentSuccess(order) {
  track('PaymentSuccess', {
    order_id: order.order_id,
    order_amount: parseFloat(order.total_price),
    payment_method: order.payment_method,
    payment_channel: 'wechat_pay'
  });
}

/**
 * 分销行为追踪
 */
function trackDistributionAction(action, data = {}) {
  const eventMap = {
    'share_product': 'ShareProduct',      // 分享商品
    'invite_user': 'InviteUser',          // 邀请新用户
    'restock': 'AgentRestock',            // 代理商补货
    'confirm_order': 'AgentConfirmOrder', // 代理商确认订单
    'withdraw': 'CommissionWithdraw'      // 提现
  };

  const eventName = eventMap[action] || 'DistributionAction';
  track(eventName, {
    action,
    ...data
  });
}

/**
 * 搜索行为
 */
function trackSearch(keyword, resultCount) {
  track('Search', {
    keyword,
    result_count: resultCount,
    has_result: resultCount > 0
  });
}

/**
 * 用户注册/升级
 */
function trackUserUpgrade(oldRole, newRole, upgradeType) {
  const roleNames = {
    [USER_ROLES.GUEST]: '游客',
    [USER_ROLES.MEMBER]: '普通会员',
    [USER_ROLES.LEADER]: '团长',
    [USER_ROLES.AGENT]: '代理商',
    [USER_ROLES.PARTNER]: '合伙人'
  };

  track('UserUpgrade', {
    old_role: roleNames[oldRole],
    new_role: roleNames[newRole],
    upgrade_type: upgradeType // 'register', 'invite', 'purchase', 'manual'
  });
}

module.exports = {
  sensors,
  setUserProfile,
  logout,
  track,
  trackPageView,
  trackViewProduct,
  trackAddToCart,
  trackCreateOrder,
  trackPaymentSuccess,
  trackDistributionAction,
  trackSearch,
  trackUserUpgrade
};
```

#### 3. 在 `app.js` 中集成
```javascript
// qianduan/app.js
const tracker = require('./utils/tracker');

App({
  globalData: {
    userInfo: null,
    roleLevel: 0
  },

  onLaunch(options) {
    console.log('小程序启动', options);

    // 神策自动追踪启动事件，无需手动调用

    // 尝试自动登录
    this.wxLogin();
  },

  async wxLogin() {
    try {
      // 微信登录逻辑...
      const userInfo = await this.getUserInfo();

      // 设置神策用户属性
      if (userInfo && userInfo.id) {
        tracker.setUserProfile(userInfo);
      }

      this.globalData.userInfo = userInfo;
      this.globalData.roleLevel = userInfo.role_level || 0;
    } catch (err) {
      console.error('登录失败:', err);
    }
  },

  onShow(options) {
    // 神策自动追踪显示事件
  },

  onHide() {
    // 神策自动追踪隐藏事件
  }
});
```

#### 4. 在页面中使用 (以商品详情页为例)
```javascript
// qianduan/pages/product/detail.js
const tracker = require('../../utils/tracker');

Page({
  data: {
    product: {},
    // ...
  },

  onLoad(options) {
    if (options.id) {
      this.loadProduct(options.id);
    }

    // 追踪页面来源
    const fromPage = options.from || 'direct';
    tracker.track('EnterProductDetail', {
      product_id: options.id,
      from_page: fromPage,
      share_id: options.share_id || null
    });
  },

  async loadProduct(id) {
    try {
      const res = await get(`/products/${id}`);
      const product = res.data || {};

      this.setData({ product });

      // 追踪商品浏览
      tracker.trackViewProduct(product, 'product_detail');

    } catch (err) {
      console.error('加载失败:', err);
    }
  },

  async addToCart() {
    const { product, selectedSku, quantity } = this.data;

    try {
      await post('/cart', {
        product_id: product.id,
        sku_id: selectedSku?.id || null,
        quantity
      });

      // 追踪加购行为
      tracker.trackAddToCart(product, selectedSku, quantity);

      wx.showToast({ title: '已加入购物车', icon: 'success' });
    } catch (err) {
      console.error('加入购物车失败:', err);
    }
  },

  onShareAppMessage() {
    const { product } = this.data;
    const userInfo = getApp().globalData.userInfo;

    // 追踪分享行为
    tracker.trackDistributionAction('share_product', {
      product_id: product.id,
      product_name: product.name,
      sharer_id: userInfo?.id || null
    });

    return {
      title: product.name,
      path: `/pages/product/detail?id=${product.id}&share_id=${userInfo?.id}`,
      imageUrl: product.images[0]
    };
  }
});
```

#### 5. 在订单确认页追踪转化
```javascript
// qianduan/pages/order/confirm.js
const tracker = require('../../utils/tracker');

Page({
  // 提交订单
  async submitOrder() {
    try {
      const res = await post('/orders', orderData);
      const order = res.data;

      // 追踪下单事件
      tracker.trackCreateOrder(order, this.data.products);

      // 跳转支付
      this.goPay(order.order_id);

    } catch (err) {
      console.error('提交订单失败:', err);
    }
  },

  async goPay(orderId) {
    try {
      // 调起微信支付...
      const payRes = await wx.requestPayment({ /* ... */ });

      // 支付成功追踪
      tracker.trackPaymentSuccess({
        order_id: orderId,
        total_price: this.data.totalAmount,
        payment_method: 'wechat_pay'
      });

      wx.redirectTo({ url: `/pages/order/detail?id=${orderId}&status=paid` });

    } catch (err) {
      console.error('支付失败:', err);
    }
  }
});
```

---

### 方案B: 自建埋点系统 (低成本方案)

如果预算有限，可以自建轻量级埋点系统：

#### 1. 创建前端追踪工具 `qianduan/utils/simpleTracker.js`
```javascript
/**
 * 轻量级自建追踪工具
 * 将埋点数据发送到后端 /api/analytics/track
 */
const { post } = require('./request');

let sessionId = null;
let userId = null;
let userRole = null;

/**
 * 初始化会话
 */
function init() {
  sessionId = generateSessionId();
  const userInfo = wx.getStorageSync('userInfo');
  if (userInfo) {
    userId = userInfo.id;
    userRole = userInfo.role_level;
  }
}

/**
 * 生成会话 ID
 */
function generateSessionId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 发送埋点数据
 */
async function track(eventName, properties = {}) {
  const eventData = {
    event_name: eventName,
    properties: {
      ...properties,
      session_id: sessionId,
      user_id: userId,
      user_role: userRole,
      timestamp: new Date().toISOString(),
      platform: 'wechat_miniprogram',
      version: wx.getAccountInfoSync().miniProgram.version || 'dev'
    }
  };

  try {
    // 异步发送，不阻塞用户操作
    await post('/analytics/track', eventData, { showLoading: false, showError: false });
  } catch (err) {
    console.error('埋点发送失败:', err);
    // 失败不影响主流程
  }
}

/**
 * 批量发送（减少请求次数）
 */
const eventQueue = [];
let flushTimer = null;

function trackBatch(eventName, properties = {}) {
  eventQueue.push({ eventName, properties, timestamp: Date.now() });

  // 每 5 秒或累积 10 条事件时批量发送
  if (eventQueue.length >= 10) {
    flushEvents();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushEvents, 5000);
  }
}

async function flushEvents() {
  if (eventQueue.length === 0) return;

  const events = eventQueue.splice(0, eventQueue.length);
  clearTimeout(flushTimer);
  flushTimer = null;

  try {
    await post('/analytics/batch', {
      events: events.map(e => ({
        event_name: e.eventName,
        properties: {
          ...e.properties,
          session_id: sessionId,
          user_id: userId,
          user_role: userRole,
          timestamp: new Date(e.timestamp).toISOString()
        }
      }))
    }, { showLoading: false, showError: false });
  } catch (err) {
    console.error('批量埋点发送失败:', err);
  }
}

// 小程序隐藏时立即发送剩余事件
function onAppHide() {
  if (eventQueue.length > 0) {
    flushEvents();
  }
}

module.exports = {
  init,
  track,
  trackBatch,
  onAppHide
};
```

#### 2. 后端接收接口 `backend/routes/analytics.js`
```javascript
const express = require('express');
const router = express.Router();
const { ActivityLog } = require('../models');
const { info } = require('../utils/logger');

/**
 * 接收单个埋点事件
 * POST /api/analytics/track
 */
router.post('/track', async (req, res) => {
  try {
    const { event_name, properties } = req.body;

    // 记录到 ActivityLog 表
    await ActivityLog.create({
      user_id: properties.user_id || null,
      action: event_name,
      resource: 'analytics',
      details: JSON.stringify(properties),
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      status: 'success'
    });

    // 记录到日志
    info('ANALYTICS', `事件追踪: ${event_name}`, properties);

    res.json({ code: 0, message: '追踪成功' });
  } catch (err) {
    console.error('埋点记录失败:', err);
    res.status(500).json({ code: -1, message: '记录失败' });
  }
});

/**
 * 批量接收埋点事件
 * POST /api/analytics/batch
 */
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ code: -1, message: '事件列表不能为空' });
    }

    // 批量插入
    const records = events.map(e => ({
      user_id: e.properties.user_id || null,
      action: e.event_name,
      resource: 'analytics',
      details: JSON.stringify(e.properties),
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      status: 'success',
      created_at: e.properties.timestamp || new Date()
    }));

    await ActivityLog.bulkCreate(records);

    info('ANALYTICS', `批量追踪: ${events.length} 个事件`);

    res.json({ code: 0, message: '批量追踪成功', count: events.length });
  } catch (err) {
    console.error('批量埋点记录失败:', err);
    res.status(500).json({ code: -1, message: '批量记录失败' });
  }
});

module.exports = router;
```

---

## 📈 关键指标追踪 (Key Metrics to Track)

### 1. 用户生命周期指标
```javascript
// 新用户注册
tracker.track('UserRegister', {
  register_source: 'wechat_login',
  invite_code: inviteCode || null,
  parent_id: parentId || null
});

// 首次下单
tracker.track('FirstOrder', {
  order_id: orderId,
  order_amount: amount,
  days_since_register: daysSinceRegister
});

// 用户留存检测 (后端定时任务计算)
// - Day 1 留存率
// - Day 7 留存率
// - Day 30 留存率
```

### 2. 转化漏斗指标
```
启动小程序 → 浏览商品 → 加入购物车 → 提交订单 → 完成支付
   100%         60%          30%           15%          10%

分销漏斗:
浏览代理中心 → 点击升级按钮 → 提交申请 → 审核通过
   100%           40%            20%          15%
```

追踪代码:
```javascript
// 漏斗节点 1: 浏览商品
tracker.track('FunnelStep_ViewProduct', { product_id: id });

// 漏斗节点 2: 加入购物车
tracker.track('FunnelStep_AddToCart', { product_id: id });

// 漏斗节点 3: 提交订单
tracker.track('FunnelStep_CreateOrder', { order_id: orderId });

// 漏斗节点 4: 支付成功
tracker.track('FunnelStep_PaymentSuccess', { order_id: orderId });
```

### 3. 分销效果指标
```javascript
// 分享行为
tracker.trackDistributionAction('share_product', {
  product_id: productId,
  share_channel: 'wechat_friend' // 或 'wechat_moment'
});

// 邀请转化
tracker.track('InviteConversion', {
  inviter_id: inviterId,
  invitee_id: inviteeId,
  conversion_days: days // 从邀请到注册的天数
});

// 代理商业绩
tracker.track('AgentPerformance', {
  agent_id: agentId,
  total_sales: totalSales,
  total_commission: totalCommission,
  team_size: teamSize,
  active_users: activeUsers
});
```

### 4. 商品与运营指标
```javascript
// 商品曝光 (列表页自动追踪)
tracker.track('ProductImpression', {
  product_id: productId,
  position: index, // 列表中的位置
  page_type: 'category_list' // 或 'search_result', 'homepage'
});

// 搜索行为
tracker.trackSearch(keyword, resultCount);

// 优惠券使用
tracker.track('CouponUsed', {
  coupon_id: couponId,
  discount_amount: discountAmount,
  order_id: orderId
});
```

---

## 🔔 实时监控与告警

### 配置实时告警规则 (神策后台配置)

1. **高价值用户行为告警**
   - 单笔订单金额 > ¥5,000
   - 当日累计下单 > 3 笔
   - 代理商单日销售额 > ¥10,000

   → 实时推送到企业微信/钉钉

2. **异常行为告警**
   - 同一 IP 1 小时内创建 > 10 个订单
   - 同一设备 ID 注册多个账号
   - 支付失败率 > 20%

   → 触发风控审核

3. **业务指标告警**
   - 当日 GMV 低于预期 30%
   - 支付转化率下降 > 5%
   - 新用户注册量下降 > 20%

   → 通知运营团队

---

## 📊 数据分析看板

### 推荐创建的看板 (神策/自建 BI)

1. **实时运营看板**
   - 今日 UV/PV
   - 今日订单数/GMV
   - 今日新增用户/活跃用户
   - 实时支付转化率

2. **分销效果看板**
   - 代理商分布地图
   - Top 10 代理商销售排行
   - 邀请转化漏斗
   - 团队裂变层级分析

3. **商品运营看板**
   - 商品浏览排行
   - 加购率/转化率
   - 动销率/滞销商品预警
   - 库存周转率

4. **用户画像看板**
   - 用户地域分布
   - 用户角色占比
   - RFM 模型分析 (最近购买/购买频率/购买金额)
   - 用户生命周期价值 (LTV)

---

## 💰 成本与 ROI 预估

### 神策数据方案
- **初始投入**: ¥15,000/年 (基础版)
- **实施成本**: 1 周开发时间 (1 人)
- **预期收益**:
  - 转化率提升 8-15% (通过漏斗分析优化)
  - 代理商拉新效率提升 20% (分享路径优化)
  - 运营人效提升 30% (自动化报表)
  - **年化 ROI**: 300-500%

### 自建方案
- **初始投入**: ¥0 (仅开发成本)
- **实施成本**: 2-3 周开发时间 (1 人)
- **后期维护**: 需要专人维护数据管道和分析报表
- **局限性**:
  - 缺少实时分析能力
  - 缺少用户分群和精准营销
  - 需要自建数据仓库和 BI 系统

**推荐**:
- **初期**: 使用自建方案验证业务价值
- **成熟期**: 切换到神策数据，释放团队精力

---

## 🚀 实施路线图

### Phase 1: 基础埋点 (1-2 周)
- [ ] 集成神策 SDK / 自建 tracker
- [ ] 实现用户登录追踪
- [ ] 实现商品浏览、加购、下单、支付全链路追踪
- [ ] 配置基础看板 (UV/PV/GMV/转化率)

### Phase 2: 分销追踪 (1 周)
- [ ] 追踪分享行为和邀请转化
- [ ] 追踪代理商业务行为 (补货、确认订单、提现)
- [ ] 创建分销效果看板

### Phase 3: 高级分析 (2-3 周)
- [ ] 配置用户分群规则
- [ ] 创建转化漏斗分析
- [ ] 创建留存分析报表
- [ ] 配置实时告警规则

### Phase 4: 精准营销 (持续优化)
- [ ] 基于用户分群的个性化推荐
- [ ] A/B 测试框架集成
- [ ] 自动化营销活动触发

---

## ⚠️ 注意事项

1. **数据合规**
   - 遵守《个人信息保护法》，在隐私政策中说明数据收集范围
   - 敏感字段脱敏处理 (如手机号、地址)
   - 提供用户数据删除功能

2. **性能影响**
   - 埋点请求使用异步发送，不阻塞主流程
   - 批量发送减少网络请求
   - 埋点失败不影响业务功能

3. **埋点治理**
   - 建立埋点文档，记录每个事件的业务含义
   - 定期清理无效埋点
   - 埋点命名规范: 大驼峰 + 动词 (如 `ViewProduct`, `AddToCart`)

---

## 📞 技术支持

- **神策数据官网**: https://www.sensorsdata.cn
- **神策小程序 SDK 文档**: https://manual.sensorsdata.cn/sa/latest/mp-sdk-7545386.html
- **微信小程序数据分析**: https://developers.weixin.qq.com/miniprogram/analysis/

---

**下一步行动**:
1. 确认采用神策还是自建方案
2. 如选择神策，联系销售获取试用账号
3. 安排开发资源，按照本指南 Phase 1 开始实施
