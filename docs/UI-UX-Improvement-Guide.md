# UI/UX 改进实施指南 UI/UX Improvement Implementation Guide

**基于**: 前端全面审查报告 (Frontend-Review-Report.md)  
**目标**: 提升信息密度、优化布局、完善功能  
**时间**: 2-4 周实施周期  

---

## 🎯 Phase 2: UI/UX 改进方案

### 改进 1: 首页信息密度优化

#### 1.1 增加快捷入口（6-8 个）

**当前状态**: 3 个主入口 + 4 个次要入口（分散在 2 个卡片）  
**目标状态**: 8 个统一入口（单个卡片 4x2 网格）

**实施步骤**:

1. **修改 WXML 布局** (`pages/index/index.wxml` 第 39-83 行)

```xml
<!-- 替换原有的 main-entrances + secondary-grid -->
<view class="quick-entrances-card">
  <view class="entrances-title">快捷功能</view>
  <view class="entrances-grid">
    <view class="entrance-item" bindtap="onDistributionTap">
      <image class="entrance-icon" src="/assets/icons/distribution.svg" />
      <text class="entrance-label">分销中心</text>
    </view>
    <view class="entrance-item" bindtap="onRestockTap">
      <image class="entrance-icon" src="/assets/icons/restock.svg" />
      <text class="entrance-label">我要进货</text>
    </view>
    <view class="entrance-item" bindtap="onTeamTap">
      <image class="entrance-icon" src="/assets/icons/team.svg" />
      <text class="entrance-label">我的团队</text>
    </view>
    <view class="entrance-item" bindtap="onInviteTap">
      <image class="entrance-icon" src="/assets/icons/invite.svg" />
      <text class="entrance-label">邀请好友</text>
    </view>
    <view class="entrance-item" bindtap="onSearchTap">
      <image class="entrance-icon" src="/assets/icons/search.svg" />
      <text class="entrance-label">搜索商品</text>
    </view>
    <view class="entrance-item" bindtap="onServiceTap">
      <image class="entrance-icon" src="/assets/icons/service.svg" />
      <text class="entrance-label">在线客服</text>
    </view>
    <view class="entrance-item" bindtap="onCouponTap">
      <image class="entrance-icon" src="/assets/icons/coupon.svg" />
      <text class="entrance-label">优惠券</text>
    </view>
    <view class="entrance-item" bindtap="onNewProductTap">
      <image class="entrance-icon" src="/assets/icons/new.svg" />
      <text class="entrance-label">新品推荐</text>
    </view>
  </view>
</view>
```

2. **更新 WXSS 样式** (`pages/index/index.wxss`)

```css
/* 快捷入口卡片 */
.quick-entrances-card {
  margin: 0 30rpx 20rpx;
  background: var(--luxury-white);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
}

.entrances-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-md);
}

.entrances-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}

.entrance-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm);
  transition: transform 0.2s ease;
}

.entrance-item:active {
  transform: scale(0.95);
}

.entrance-icon {
  width: 48rpx;
  height: 48rpx;
}

.entrance-label {
  font-size: 24rpx;
  color: var(--text-secondary);
  text-align: center;
}
```

3. **实现 JS 跳转逻辑** (`pages/index/index.js`)

```javascript
// 搜索商品
onSearchTap() {
  wx.navigateTo({ url: '/pages/search/search' });
},

// 在线客服
onServiceTap() {
  wx.makePhoneCall({
    phoneNumber: '400-XXX-XXXX' // 替换为实际客服电话
  });
},

// 优惠券中心
onCouponTap() {
  wx.showToast({
    title: '优惠券功能开发中',
    icon: 'none'
  });
  // TODO: 实现优惠券页面后改为：
  // wx.navigateTo({ url: '/pages/coupon/list' });
},

// 新品推荐
onNewProductTap() {
  wx.navigateTo({
    url: '/pages/category/category?filter=new'
  });
}
```

---

### 改进 2: 个人中心资产展示增强

#### 2.1 扩展为 6 个核心指标

**当前状态**: 3 个指标（余额、累计收益、积分）  
**目标状态**: 6 个指标（2x3 网格）

**实施步骤**:

1. **更新 WXML** (`pages/user/user.wxml` 第 37-51 行)

```xml
<view class="asset-section">
  <view class="asset-item" bindtap="onBalanceTap">
    <text class="asset-value">¥{{ assets.balance || '0.00' }}</text>
    <text class="asset-label">可用余额</text>
    <view class="asset-trend" wx:if="{{ assets.balanceTrend }}">
      <text class="trend-icon">{{ assets.balanceTrend > 0 ? '↑' : '↓' }}</text>
      <text class="trend-text">{{ assets.balanceTrend }}%</text>
    </view>
  </view>
  
  <view class="asset-item">
    <text class="asset-value text-muted">¥{{ assets.frozenAmount || '0.00' }}</text>
    <text class="asset-label">冻结金额</text>
  </view>
  
  <view class="asset-item" bindtap="onTodayIncomeTap">
    <text class="asset-value highlight">¥{{ assets.todayIncome || '0.00' }}</text>
    <text class="asset-label">今日收益</text>
    <view class="asset-badge" wx:if="{{ assets.todayIncome > 0 }}">NEW</view>
  </view>
  
  <view class="asset-item">
    <text class="asset-value highlight">¥{{ assets.totalCommission || '0.00' }}</text>
    <text class="asset-label">累计收益</text>
  </view>
  
  <view class="asset-item" bindtap="onTeamTap">
    <text class="asset-value">{{ assets.teamSize || 0 }}</text>
    <text class="asset-label">团队人数</text>
  </view>
  
  <view class="asset-item">
    <text class="asset-value">¥{{ assets.monthSales || '0.00' }}</text>
    <text class="asset-label">本月业绩</text>
  </view>
</view>
```

2. **更新 WXSS** (`pages/user/user.wxss`)

```css
/* 资产统计 */
.asset-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  padding: var(--space-md) 0;
}

.asset-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
  position: relative;
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  transition: background-color 0.2s ease;
}

.asset-item:active {
  background-color: var(--luxury-ivory);
}

.asset-value {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.asset-value.highlight {
  color: var(--luxury-gold);
}

.asset-value.text-muted {
  color: var(--text-tertiary);
}

.asset-label {
  font-size: 24rpx;
  color: var(--text-muted);
}

.asset-trend {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 20rpx;
  margin-top: 4rpx;
}

.trend-icon {
  font-size: 24rpx;
}

.trend-text {
  color: var(--color-success);
}

.asset-badge {
  position: absolute;
  top: 0;
  right: 0;
  background: linear-gradient(135deg, var(--luxury-gold), var(--luxury-gold-light));
  color: var(--luxury-white);
  font-size: 18rpx;
  padding: 2rpx 8rpx;
  border-radius: var(--radius-full);
}
```

3. **更新 JS 数据加载** (`pages/user/user.js`)

```javascript
async loadDistributionOverview() {
  try {
    const { data: d } = await get('/distribution/overview');
    
    // 计算今日收益（从 recentCommissions 中筛选今日数据）
    const today = new Date().toDateString();
    const todayIncome = d.recentCommissions
      ?.filter(c => new Date(c.created_at).toDateString() === today)
      .reduce((sum, c) => sum + parseFloat(c.amount || 0), 0) || 0;
    
    this.setData({
      assets: {
        balance: d.stats?.balance || 0,
        frozenAmount: d.stats?.frozenAmount || 0,
        todayIncome: todayIncome.toFixed(2),
        totalCommission: d.stats?.totalCommission || 0,
        teamSize: d.team?.totalCount || 0,
        monthSales: d.stats?.monthSales || 0,
        points: d.stats?.points || 0,
        balanceTrend: this.calculateTrend(d.stats?.balance, d.stats?.lastMonthBalance)
      }
    });
  } catch (error) {
    ErrorHandler.handle(error);
  }
}

// 计算趋势百分比
calculateTrend(current, previous) {
  if (!previous || previous === 0) return 0;
  return (((current - previous) / previous) * 100).toFixed(1);
}
```

---

### 改进 3: 完善 SKU 选择逻辑

**当前状态**: `pages/product/detail.js` 第 243-256 行为占位代码  
**目标**: 实现完整的 SKU 选择和库存校验

**实施步骤**:

1. **实现 SKU 选择器 WXML** (创建 `components/sku-selector/sku-selector.wxml`)

```xml
<view class="sku-modal" wx:if="{{ show }}" catchtap="onMaskTap">
  <view class="sku-content" catchtap="stopPropagation">
    <!-- 商品信息 -->
    <view class="sku-header">
      <image class="sku-image" src="{{ product.image }}" />
      <view class="sku-info">
        <text class="sku-price">¥{{ currentSku.price || product.price }}</text>
        <text class="sku-stock">库存: {{ currentSku.stock || 0 }}</text>
      </view>
      <view class="sku-close" bindtap="onClose">×</view>
    </view>
    
    <!-- 规格选择 -->
    <view class="sku-specs">
      <view class="spec-group" wx:for="{{ specs }}" wx:key="name">
        <text class="spec-label">{{ item.name }}</text>
        <view class="spec-options">
          <view
            class="spec-option {{ selectedSpecs[item.name] === option ? 'active' : '' }} {{ option.disabled ? 'disabled' : '' }}"
            wx:for="{{ item.options }}"
            wx:for-item="option"
            wx:key="*this"
            bindtap="onSpecTap"
            data-spec="{{ item.name }}"
            data-value="{{ option }}"
          >
            {{ option }}
          </view>
        </view>
      </view>
    </view>
    
    <!-- 数量选择 -->
    <view class="sku-quantity">
      <text class="quantity-label">数量</text>
      <view class="quantity-control">
        <view class="quantity-btn {{ quantity <= 1 ? 'disabled' : '' }}" bindtap="onDecrease">-</view>
        <input class="quantity-input" type="number" value="{{ quantity }}" bindinput="onQuantityInput" />
        <view class="quantity-btn {{ quantity >= currentSku.stock ? 'disabled' : '' }}" bindtap="onIncrease">+</view>
      </view>
    </view>
    
    <!-- 确认按钮 -->
    <view class="sku-actions">
      <button class="btn-confirm" bindtap="onConfirm">确定</button>
    </view>
  </view>
</view>
```

2. **实现 SKU 选择器 JS** (创建 `components/sku-selector/sku-selector.js`)

```javascript
Component({
  properties: {
    show: { type: Boolean, value: false },
    product: { type: Object, value: {} },
    skuList: { type: Array, value: [] }
  },
  
  data: {
    specs: [],
    selectedSpecs: {},
    currentSku: {},
    quantity: 1
  },
  
  observers: {
    'show, skuList': function(show, skuList) {
      if (show && skuList.length > 0) {
        this.initSpecs();
      }
    }
  },
  
  methods: {
    // 初始化规格
    initSpecs() {
      const skuList = this.data.skuList;
      const specsMap = {};
      
      // 提取所有规格
      skuList.forEach(sku => {
        const specs = JSON.parse(sku.specs || '{}');
        Object.entries(specs).forEach(([key, value]) => {
          if (!specsMap[key]) specsMap[key] = new Set();
          specsMap[key].add(value);
        });
      });
      
      // 转换为数组格式
      const specs = Object.entries(specsMap).map(([name, options]) => ({
        name,
        options: Array.from(options)
      }));
      
      this.setData({ specs });
    },
    
    // 选择规格
    onSpecTap(e) {
      const { spec, value } = e.currentTarget.dataset;
      const selectedSpecs = { ...this.data.selectedSpecs, [spec]: value };
      
      this.setData({ selectedSpecs });
      this.updateCurrentSku();
    },
    
    // 更新当前 SKU
    updateCurrentSku() {
      const { selectedSpecs, skuList } = this.data;
      
      // 查找匹配的 SKU
      const currentSku = skuList.find(sku => {
        const specs = JSON.parse(sku.specs || '{}');
        return Object.entries(selectedSpecs).every(
          ([key, value]) => specs[key] === value
        );
      });
      
      this.setData({ currentSku: currentSku || {} });
    },
    
    // 减少数量
    onDecrease() {
      if (this.data.quantity > 1) {
        this.setData({ quantity: this.data.quantity - 1 });
      }
    },
    
    // 增加数量
    onIncrease() {
      const { quantity, currentSku } = this.data;
      const maxStock = currentSku.stock || 0;
      
      if (quantity < maxStock) {
        this.setData({ quantity: quantity + 1 });
      } else {
        wx.showToast({ title: '库存不足', icon: 'none' });
      }
    },
    
    // 确认选择
    onConfirm() {
      const { currentSku, quantity, selectedSpecs } = this.data;
      
      if (!currentSku.id) {
        wx.showToast({ title: '请选择规格', icon: 'none' });
        return;
      }
      
      this.triggerEvent('confirm', { sku: currentSku, quantity, specs: selectedSpecs });
      this.onClose();
    },
    
    onClose() {
      this.triggerEvent('close');
    },
    
    onMaskTap() {
      this.onClose();
    },
    
    stopPropagation() {
      // 阻止事件冒泡
    }
  }
});
```

3. **在商品详情页使用** (`pages/product/detail.js`)

```javascript
data: {
  showSkuSelector: false,
  // ...
},

// 打开 SKU 选择器
onBuyNow() {
  this.setData({ showSkuSelector: true });
},

// SKU 确认回调
onSkuConfirm(e) {
  const { sku, quantity, specs } = e.detail;
  
  // 存储选中的 SKU 信息
  this.setData({
    selectedSku: sku,
    selectedQuantity: quantity,
    selectedSpecs: specs
  });
  
  // 跳转到订单确认页
  wx.navigateTo({
    url: `/pages/order/confirm?productId=${this.data.id}&skuId=${sku.id}&quantity=${quantity}`
  });
},

onSkuClose() {
  this.setData({ showSkuSelector: false });
}
```

4. **在 WXML 中使用组件** (`pages/product/detail.wxml`)

```xml
<sku-selector
  show="{{ showSkuSelector }}"
  product="{{ product }}"
  skuList="{{ skuList }}"
  bind:confirm="onSkuConfirm"
  bind:close="onSkuClose"
/>
```

---

### 改进 4: 统一使用 checkLogin 辅助函数

**目标**: 替换所有重复的登录检查代码

**实施步骤**:

1. **在页面中引入 helper** (各需要登录的页面)

```javascript
const { checkLogin } = require('../../utils/helpers');
```

2. **替换重复代码** (示例)

**旧代码**:
```javascript
onWithdraw() {
  if (!this.data.isLoggedIn) {
    wx.showToast({ title: '请先登录', icon: 'none' });
    return;
  }
  // 提现逻辑
  this.processWithdraw();
}
```

**新代码**:
```javascript
onWithdraw() {
  if (!checkLogin(this)) return;
  
  // 提现逻辑
  this.processWithdraw();
}
```

或使用回调模式:
```javascript
onWithdraw() {
  checkLogin(this, () => {
    this.processWithdraw();
  });
}
```

---

## 📊 实施时间表 Implementation Timeline

| 改进项 | 优先级 | 预估时间 | 依赖 |
|-------|-------|---------|-----|
| 首页快捷入口优化 | 🔴 High | 2-3 天 | 无 |
| 个人中心资产展示 | 🔴 High | 2-3 天 | 后端 API 支持 |
| SKU 选择器组件 | 🔴 High | 3-5 天 | 无 |
| 统一 checkLogin | 🟡 Medium | 1 天 | 无 |
| 按钮微交互 | 🟡 Medium | 1-2 天 | 无 |
| 空状态优化 | 🟡 Medium | 2-3 天 | 设计资源 |
| 图片压缩/CDN | 🟢 Low | 1-2 天 | DevOps |

**总计**: 12-19 天（约 2-3 周）

---

## ✅ 验收标准 Acceptance Criteria

### 首页快捷入口
- [ ] 显示 8 个功能入口
- [ ] 采用 4x2 网格布局
- [ ] 图标和文字对齐居中
- [ ] 点击有视觉反馈（scale 0.95）
- [ ] 所有入口均有实际跳转或提示

### 个人中心资产
- [ ] 显示 6 个核心指标
- [ ] 采用 3x2 网格布局
- [ ] 今日收益显示 NEW 标签
- [ ] 趋势箭头显示正确（↑/↓）
- [ ] 点击可跳转到对应明细页

### SKU 选择器
- [ ] 弹窗显示商品信息
- [ ] 规格选项可多选
- [ ] 库存不足时禁用选项
- [ ] 数量选择有上下限
- [ ] 确认后正确传递数据

---

**文档版本**: V1.0  
**最后更新**: 2026-02-17  
**作者**: Claude Code Agent
