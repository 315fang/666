# 插画实施指南 - 代码示例
# Illustration Implementation Guide with Code Examples

**基于**: Illustration-Design-Philosophy.md  
**目标**: 提供可直接使用的插画代码示例  

---

## 🎨 完整插画代码示例

### 示例 1: 空购物车插画（完整版）

#### WXML 结构

```xml
<!-- pages/cart/cart.wxml -->
<view class="empty-state" wx:if="{{cartItems.length === 0}}">
  <!-- 插画容器 -->
  <view class="illustration-wrapper">
    <view class="illustration empty-cart">
      <!-- 背景光晕 -->
      <view class="glow"></view>
      
      <!-- SVG 插画 -->
      <view class="svg-container">
        <!-- 小人 -->
        <view class="person">
          <view class="head"></view>
          <view class="body"></view>
          <view class="arm-left"></view>
          <view class="arm-right pushing"></view>
          <view class="leg-left"></view>
          <view class="leg-right"></view>
        </view>
        
        <!-- 购物车 -->
        <view class="cart">
          <view class="cart-body"></view>
          <view class="cart-handle"></view>
          <view class="wheel wheel-left"></view>
          <view class="wheel wheel-right"></view>
        </view>
        
        <!-- 金币（多个） -->
        <view class="coins">
          <view class="coin coin-1"></view>
          <view class="coin coin-2"></view>
          <view class="coin coin-3"></view>
        </view>
      </view>
    </view>
  </view>
  
  <!-- 文案 -->
  <view class="empty-content">
    <text class="empty-title">购物车空空如也</text>
    <text class="empty-subtitle">去选购商品，开始赚取佣金吧！</text>
  </view>
  
  <!-- CTA按钮 -->
  <view class="empty-action">
    <button class="primary-btn" bindtap="onGoShopping">
      <image class="btn-icon" src="/assets/icons/shopping-bag.svg" mode="aspectFit" />
      <text>立即购物</text>
    </button>
  </view>
</view>
```

#### WXSS 样式

```css
/* 空状态容器 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: var(--space-xl);
}

/* 插画容器 */
.illustration-wrapper {
  width: 240rpx;
  height: 240rpx;
  margin-bottom: var(--space-xl);
  position: relative;
}

.illustration {
  width: 100%;
  height: 100%;
  position: relative;
}

/* 背景光晕 */
.glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200rpx;
  height: 200rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(254, 243, 199, 0.6) 0%, rgba(250, 250, 249, 0) 70%);
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
}

/* SVG容器 */
.svg-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* 小人 */
.person {
  position: absolute;
  left: 60rpx;
  top: 60rpx;
}

.person .head {
  width: 30rpx;
  height: 30rpx;
  border: 3rpx solid var(--luxury-black);
  border-radius: 50%;
  position: absolute;
  left: 0;
  top: 0;
}

.person .body {
  width: 3rpx;
  height: 60rpx;
  background: var(--luxury-black);
  position: absolute;
  left: 13rpx;
  top: 30rpx;
}

.person .arm-right {
  width: 3rpx;
  height: 50rpx;
  background: var(--luxury-black);
  position: absolute;
  left: 13rpx;
  top: 45rpx;
  transform-origin: top center;
  transform: rotate(30deg);
}

.person .arm-right.pushing {
  animation: push 1.5s ease-in-out infinite;
}

@keyframes push {
  0%, 100% { transform: rotate(30deg); }
  50% { transform: rotate(35deg); }
}

.person .leg-left,
.person .leg-right {
  width: 3rpx;
  height: 40rpx;
  background: var(--luxury-black);
  position: absolute;
  top: 90rpx;
}

.person .leg-left {
  left: 8rpx;
  transform: rotate(-10deg);
}

.person .leg-right {
  left: 18rpx;
  transform: rotate(10deg);
}

/* 购物车 */
.cart {
  position: absolute;
  left: 110rpx;
  top: 80rpx;
  animation: cartWiggle 3s ease-in-out infinite;
}

@keyframes cartWiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-1deg); }
  75% { transform: rotate(1deg); }
}

.cart .cart-body {
  width: 60rpx;
  height: 45rpx;
  border: 3rpx solid var(--luxury-black);
  border-radius: var(--radius-sm);
  position: relative;
}

.cart .cart-handle {
  width: 3rpx;
  height: 30rpx;
  background: var(--luxury-black);
  position: absolute;
  left: -5rpx;
  top: -10rpx;
}

.cart .wheel {
  width: 15rpx;
  height: 15rpx;
  border: 3rpx solid var(--luxury-black);
  border-radius: 50%;
  position: absolute;
  top: 50rpx;
}

.cart .wheel-left { left: 10rpx; }
.cart .wheel-right { right: 10rpx; }

/* 金币 */
.coins {
  position: absolute;
}

.coin {
  width: 16rpx;
  height: 16rpx;
  background: var(--luxury-gold);
  border-radius: 50%;
  position: absolute;
  box-shadow: 0 0 10rpx rgba(202, 138, 4, 0.5);
}

.coin-1 {
  left: 140rpx;
  top: 40rpx;
  animation: coinFloat 2s ease-in-out infinite;
}

.coin-2 {
  left: 160rpx;
  top: 50rpx;
  animation: coinFloat 2.3s ease-in-out infinite;
  animation-delay: 0.3s;
  opacity: 0.8;
}

.coin-3 {
  left: 150rpx;
  top: 60rpx;
  animation: coinFloat 2.6s ease-in-out infinite;
  animation-delay: 0.6s;
  opacity: 0.6;
}

@keyframes coinFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15rpx); }
}

/* 空状态文案 */
.empty-content {
  text-align: center;
  margin-bottom: var(--space-lg);
}

.empty-title {
  display: block;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin-bottom: var(--space-xs);
}

.empty-subtitle {
  display: block;
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
}

/* CTA按钮 */
.empty-action {
  width: 100%;
  max-width: 400rpx;
}

.primary-btn {
  width: 100%;
  height: 88rpx;
  background: var(--luxury-gold);
  color: var(--luxury-white);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  box-shadow: var(--shadow-gold);
  transition: all var(--duration-fast);
}

.primary-btn:active {
  transform: scale(0.98);
  opacity: 0.9;
}

.btn-icon {
  width: 28rpx;
  height: 28rpx;
}
```

#### JavaScript 交互

```javascript
// pages/cart/cart.js
Page({
  data: {
    cartItems: []
  },
  
  onGoShopping() {
    wx.switchTab({ url: '/pages/category/category' });
  }
});
```

---

### 示例 2: 成就庆祝插画（首单成功）

#### WXML 结构

```xml
<!-- components/achievement-modal/achievement-modal.wxml -->
<view class="modal-overlay" wx:if="{{show}}" bindtap="onClose">
  <view class="modal-content" catchtap="">
    <!-- 插画 -->
    <view class="achievement-illustration">
      <!-- 背景光效 -->
      <view class="success-glow"></view>
      
      <!-- 小人（胜利姿势） -->
      <view class="person-victory">
        <view class="head"></view>
        <view class="body"></view>
        <view class="arm-left raised"></view>
        <view class="arm-right raised"></view>
        <view class="leg-left"></view>
        <view class="leg-right"></view>
      </view>
      
      <!-- 奖杯 -->
      <view class="trophy">
        <view class="trophy-top"></view>
        <view class="trophy-body"></view>
        <view class="trophy-base"></view>
        <view class="trophy-shine"></view>
      </view>
      
      <!-- 金币雨 -->
      <view class="coin-rain">
        <view class="rain-coin" wx:for="{{10}}" wx:key="index" style="left: {{item * 30}}rpx; animation-delay: {{item * 0.15}}s"></view>
      </view>
    </view>
    
    <!-- 文案 -->
    <view class="achievement-content">
      <text class="achievement-title">🎉 恭喜！首单成功</text>
      <text class="achievement-subtitle">您已获得佣金</text>
      <text class="achievement-amount">¥{{commission}}</text>
    </view>
    
    <!-- 操作按钮 -->
    <view class="achievement-actions">
      <button class="action-btn primary" bindtap="onContinue">继续分享赚更多</button>
      <button class="action-btn secondary" bindtap="onViewDetails">查看佣金明细</button>
    </view>
  </view>
</view>
```

#### WXSS 样式

```css
/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  width: 600rpx;
  background: var(--luxury-white);
  border-radius: var(--radius-2xl);
  padding: var(--space-2xl) var(--space-xl);
  animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideUp {
  from { transform: translateY(100rpx); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

/* 成就插画 */
.achievement-illustration {
  width: 300rpx;
  height: 300rpx;
  margin: 0 auto var(--space-xl);
  position: relative;
}

/* 背景光效 */
.success-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 250rpx;
  height: 250rpx;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(254, 243, 199, 0.9) 0%, rgba(250, 250, 249, 0) 70%);
  animation: successPulse 2s ease-in-out infinite;
}

@keyframes successPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.2); }
}

/* 小人（胜利姿势） */
.person-victory {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.person-victory .head {
  width: 40rpx;
  height: 40rpx;
  border: 4rpx solid var(--luxury-black);
  border-radius: 50%;
  position: absolute;
  left: -20rpx;
  top: -80rpx;
}

.person-victory .body {
  width: 4rpx;
  height: 70rpx;
  background: var(--luxury-black);
  position: absolute;
  left: 0;
  top: -40rpx;
}

.person-victory .arm-left,
.person-victory .arm-right {
  width: 4rpx;
  height: 55rpx;
  background: var(--luxury-black);
  position: absolute;
  top: -35rpx;
  transform-origin: bottom center;
}

.person-victory .arm-left {
  left: -25rpx;
  transform: rotate(-45deg);
  animation: armWave 0.5s ease-in-out infinite alternate;
}

.person-victory .arm-right {
  right: -25rpx;
  transform: rotate(45deg);
  animation: armWave 0.5s ease-in-out infinite alternate;
  animation-delay: 0.25s;
}

@keyframes armWave {
  from { transform: rotate(40deg); }
  to { transform: rotate(50deg); }
}

/* 奖杯 */
.trophy {
  position: absolute;
  left: 50%;
  top: -120rpx;
  transform: translateX(-50%);
}

.trophy-top {
  width: 50rpx;
  height: 20rpx;
  background: var(--luxury-gold);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  position: relative;
}

.trophy-body {
  width: 40rpx;
  height: 30rpx;
  background: var(--luxury-gold-light);
  margin: 0 5rpx;
  position: relative;
}

.trophy-base {
  width: 50rpx;
  height: 15rpx;
  background: var(--luxury-gold);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.trophy-shine {
  width: 8rpx;
  height: 25rpx;
  background: rgba(255, 255, 255, 0.6);
  position: absolute;
  left: 10rpx;
  top: 5rpx;
  border-radius: 4rpx;
  animation: shine 1.5s ease-in-out infinite;
}

@keyframes shine {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* 金币雨 */
.coin-rain {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.rain-coin {
  width: 12rpx;
  height: 12rpx;
  background: var(--luxury-gold);
  border-radius: 50%;
  position: absolute;
  top: -20rpx;
  animation: coinRain 2s linear infinite;
}

@keyframes coinRain {
  0% { top: -20rpx; opacity: 1; }
  90% { opacity: 1; }
  100% { top: 320rpx; opacity: 0; }
}

/* 成就内容 */
.achievement-content {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.achievement-title {
  display: block;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
}

.achievement-subtitle {
  display: block;
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-bottom: var(--space-xs);
}

.achievement-amount {
  display: block;
  font-size: var(--text-4xl);
  font-weight: var(--font-extrabold);
  color: var(--luxury-gold);
  font-family: var(--font-mono);
  margin-top: var(--space-sm);
  animation: amountPop 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes amountPop {
  0% { transform: scale(0); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

/* 操作按钮 */
.achievement-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.action-btn {
  width: 100%;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  transition: all var(--duration-fast);
}

.action-btn.primary {
  background: var(--luxury-gold);
  color: var(--luxury-white);
  box-shadow: var(--shadow-gold);
}

.action-btn.secondary {
  background: var(--luxury-ivory);
  color: var(--text-primary);
  border: 1rpx solid var(--luxury-border);
}

.action-btn:active {
  transform: scale(0.98);
}
```

#### JavaScript 组件

```javascript
// components/achievement-modal/achievement-modal.js
Component({
  properties: {
    show: { type: Boolean, value: false },
    commission: { type: String, value: '0.00' },
    achievementType: { type: String, value: 'first_order' }
  },
  
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    
    onContinue() {
      this.triggerEvent('continue');
      this.onClose();
    },
    
    onViewDetails() {
      this.triggerEvent('viewDetails');
      this.onClose();
    }
  }
});
```

#### 使用方式

```xml
<!-- 在页面中使用 -->
<achievement-modal 
  show="{{showAchievement}}"
  commission="{{commission}}"
  bind:close="onCloseAchievement"
  bind:continue="onContinueSharing"
  bind:viewDetails="onViewCommission"
/>
```

---

## 📦 插画组件库

### 创建可复用的插画组件

#### 组件结构

```
components/
└── illustrations/
    ├── empty-cart/
    │   ├── empty-cart.wxml
    │   ├── empty-cart.wxss
    │   ├── empty-cart.js
    │   └── empty-cart.json
    ├── achievement/
    │   └── ...
    └── guide/
        └── ...
```

#### 通用插画组件

```javascript
// components/illustrations/base-illustration/base-illustration.js
Component({
  properties: {
    type: {
      type: String,
      value: 'empty-cart' // 插画类型
    },
    size: {
      type: String,
      value: 'medium' // small, medium, large
    },
    animated: {
      type: Boolean,
      value: true
    }
  },
  
  data: {
    sizeMap: {
      small: 180,
      medium: 240,
      large: 300
    }
  }
});
```

---

## 🎯 最佳实践总结

### 性能优化

```
1. 使用 CSS 动画而非 JavaScript
   ✅ transform, opacity（GPU加速）
   ❌ left, top, width, height（重排）

2. 控制动画数量
   ✅ 最多3-5个同时动画元素
   ❌ 10+个元素同时动画

3. 使用 will-change
   .animated-element {
     will-change: transform;
   }

4. 控制文件大小
   ✅ SVG < 10KB
   ✅ 动画帧率 30fps（小程序）
   ❌ 复杂的 Lottie > 100KB
```

### 可访问性

```css
/* 支持减少动画 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 响应式适配

```css
/* 小屏幕 */
@media (max-width: 375px) {
  .illustration-wrapper {
    width: 200rpx;
    height: 200rpx;
  }
}

/* 大屏幕 */
@media (min-width: 414px) {
  .illustration-wrapper {
    width: 280rpx;
    height: 280rpx;
  }
}
```

---

**完整代码可直接复制使用！** 🎨  
**记得根据你的品牌色调整配色方案！** ✨

---

**文档版本**: V1.0  
**最后更新**: 2026-02-18  
**使用方式**: 复制代码 → 调整配色 → 测试效果  
