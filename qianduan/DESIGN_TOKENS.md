# 设计令牌系统 (Design Token System)

## 🎯 核心原则 (Core Principles)

**禁止使用硬编码值！** 所有样式必须使用 `app.wxss` 中定义的 CSS 变量。

**NEVER use hardcoded values!** All styles MUST use CSS variables defined in `app.wxss`.

---

## 📚 完整令牌参考 (Complete Token Reference)

### 1️⃣ 颜色系统 (Color System)

#### 主色调 (Primary Colors)
```css
--color-primary: #2563EB          /* 主蓝色 - 用于按钮、链接 */
--color-primary-light: #3B82F6    /* 浅蓝色 */
--color-primary-dark: #1D4ED8     /* 深蓝色 */
--color-primary-fade: rgba(37, 99, 235, 0.1)  /* 淡蓝色背景 */
```

**使用场景：**
- 主按钮背景：`background: var(--color-primary)`
- 链接文字：`color: var(--color-primary)`
- 图标高亮：`color: var(--color-primary)`

#### 次级色/深色 (Secondary/Dark)
```css
--color-secondary: #0F172A        /* 深夜蓝 Slate-900 */
--color-secondary-light: #1E293B  /* 浅深夜蓝 Slate-800 */
```

**使用场景：**
- 标题文字：`color: var(--color-secondary)`
- 深色背景：`background: var(--color-secondary)`

#### 强调色/金色 (Accent/Gold)
```css
--color-accent: #D97706           /* 琥珀金 - 价格、金币 */
--color-accent-light: #F59E0B     /* 浅琥珀金 */
--color-accent-bg: #FFFBEB        /* 琥珀金背景 */
```

**使用场景：**
- 价格显示：`color: var(--color-accent)`
- 金币图标：`color: var(--color-accent)`
- VIP标签：`background: var(--color-accent)`

#### 语义色 (Semantic Colors)
```css
--color-success: #10B981          /* 成功绿 */
--color-success-bg: #ECFDF5       /* 成功背景 */
--color-danger: #EF4444           /* 危险红 */
--color-danger-bg: #FEF2F2        /* 危险背景 */
--color-warning: #F59E0B          /* 警告橙 */
```

#### 文本色 (Text Colors)
```css
--color-text-main: #0F172A        /* 主文本 - 标题、正文 */
--color-text-sub: #64748B         /* 次要文本 - 描述 */
--color-text-muted: #94A3B8       /* 弱化文本 - 辅助信息 */
```

#### 边框与分隔线 (Borders & Dividers)
```css
--color-border: #E2E8F0           /* 边框色 */
--color-divider: #F1F5F9          /* 分隔线色 */
```

#### 背景色 (Backgrounds)
```css
--color-bg-page: #F8FAFC          /* 页面背景 */
--color-bg-card: #FFFFFF          /* 卡片背景 */
--color-bg-subtle: #F1F5F9        /* 微妙背景 */
--color-bg-overlay: rgba(0, 0, 0, 0.6)  /* 遮罩背景 */
```

---

### 2️⃣ 形状系统 (Shape System)

#### 圆角 (Border Radius)
```css
--radius-sm: 8rpx                 /* 小圆角 - 标签 */
--radius-md: 16rpx                /* 中圆角 - 输入框 */
--radius-lg: 24rpx                /* 大圆角 - 产品卡片 */
--radius-xl: 32rpx                /* 超大圆角 - 主要卡片 */
--radius-full: 999rpx             /* 全圆角 - 按钮、徽章 */
```

**AI 指令：**
> ❌ 错误：`border-radius: 24rpx`
> ✅ 正确：`border-radius: var(--radius-lg)`

#### 阴影 (Shadows)
```css
--shadow-sm: 0 1rpx 2rpx rgba(0, 0, 0, 0.05)
--shadow-md: 0 4rpx 6rpx -1rpx rgba(0, 0, 0, 0.1)...
--shadow-lg: 0 10rpx 15rpx -3rpx rgba(0, 0, 0, 0.1)...
--shadow-xl: 0 20rpx 40rpx -10rpx rgba(0, 0, 0, 0.08)  /* 浮动卡片 */

/* 彩色阴影 */
--shadow-blue: 0 10rpx 25rpx -5rpx rgba(37, 99, 235, 0.25)
--shadow-amber: 0 10rpx 25rpx -5rpx rgba(217, 119, 6, 0.25)
--shadow-red: 0 4rpx 12rpx rgba(239, 68, 68, 0.3)

/* 专用阴影 */
--shadow-product: 0 4rpx 20rpx rgba(15, 23, 42, 0.06)  /* 产品卡片 */
```

#### 间距 (Spacing)
```css
--spacing-xs: 8rpx
--spacing-sm: 16rpx
--spacing-md: 24rpx
--spacing-lg: 32rpx
--spacing-xl: 48rpx
```

---

### 3️⃣ 高级风格 (Premium Styles)

#### 渐变背景 (Gradient Backgrounds)

**深夜渐变 (Midnight Gradients):**
```css
--bg-gradient-midnight: linear-gradient(135deg, #0F172A 0%, #1E293B 100%)
--bg-gradient-midnight-reverse: linear-gradient(135deg, #1E293B 0%, #0F172A 100%)
```

**使用场景：** 个人中心头部、高级功能区背景

**AI 指令：**
> ❌ 错误：`background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%)`
> ✅ 正确：`background: var(--bg-gradient-midnight)`

**玻璃态/卡片渐变：**
```css
--bg-gradient-glass: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))
--bg-gradient-card: linear-gradient(to bottom, #ffffff 0%, #fafbfc 100%)
--bg-gradient-subtle: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)
--bg-gradient-icon: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)
```

**彩色渐变 (Accent Gradients):**
```css
--bg-gradient-red: linear-gradient(135deg, #ef4444 0%, #dc2626 100%)     /* NEW标签、徽章 */
--bg-gradient-purple: linear-gradient(135deg, #667eea 0%, #764ba2 100%) /* 头像光晕 */
--bg-gradient-amber: linear-gradient(135deg, #f59e0b 0%, #d97706 100%)  /* 金色渐变 */
--bg-gradient-tag: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)    /* 标签背景 */
```

#### 光效 (Glow Effects)
```css
--glow-primary: 0 0 20rpx rgba(37, 99, 235, 0.5)   /* 蓝色光晕 */
--glow-gold: 0 0 20rpx rgba(255, 215, 0, 0.3)      /* 金色光晕 */
--glow-avatar: 0 0 20rpx rgba(102, 126, 234, 0.4)  /* 头像光晕 */
```

**使用场景：**
```css
.avatar-glow {
  box-shadow: var(--glow-avatar);
  filter: blur(12rpx);
}
```

---

### 4️⃣ 统一卡片系统 (Unified Card System)

```css
--card-surface: #ffffff                                      /* 卡片表面色 */
--card-radius: 32rpx                                         /* 统一大圆角 */
--card-radius-sm: 24rpx                                      /* 产品卡片圆角 */
--card-shadow-default: 0 2rpx 6rpx rgba(0,0,0,0.02)         /* 默认阴影 */
--card-shadow-float: 0 20rpx 40rpx -10rpx rgba(0,0,0,0.08)  /* 浮动卡片 */
--card-shadow-hover: 0 12rpx 32rpx rgba(15, 23, 42, 0.12)   /* 悬停阴影 */
--card-padding: 32rpx                                        /* 标准内边距 */
--card-padding-sm: 24rpx                                     /* 小内边距 */
```

**标准卡片示例：**
```css
.section-card {
  background: var(--card-surface);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  box-shadow: var(--card-shadow-default);
}

/* 浮动效果卡片 */
.floating-card {
  background: var(--card-surface);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  box-shadow: var(--card-shadow-float);
  margin-top: -60rpx;  /* 负边距实现悬浮 */
}
```

---

### 5️⃣ 动画与过渡系统 (Animation & Transition System)

#### 缓动函数 (Easing Functions)
```css
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)     /* 平滑缓动 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1) /* 弹性效果 */
--ease-in-out: ease-in-out                       /* 标准进出 */
```

#### 过渡时长 (Duration)
```css
--duration-fast: 0.2s      /* 快速 - 按钮、悬停 */
--duration-normal: 0.3s    /* 正常 - 模态框、卡片 */
--duration-slow: 0.5s      /* 慢速 - 图片、复杂动画 */
```

#### 变换效果 (Transform Effects)
```css
--transform-scale-press: scale(0.96)   /* 按钮按下 */
--transform-scale-hover: scale(0.98)   /* 卡片悬停 */
--transform-scale-pop: scale(1.05)     /* 弹出强调 */
```

**标准交互模式：**
```css
/* 按钮交互 */
.btn {
  transition: all var(--duration-fast);
}
.btn:active {
  transform: var(--transform-scale-press);
}

/* 卡片交互 */
.card {
  transition: all var(--duration-normal) var(--ease-smooth);
}
.card:active {
  transform: translateY(-8rpx) var(--transform-scale-hover);
  box-shadow: var(--card-shadow-hover);
}

/* 图片缩放 */
.image {
  transition: transform var(--duration-slow) var(--ease-smooth);
}
.card:active .image {
  transform: var(--transform-scale-pop);
}
```

---

### 6️⃣ 字体系统 (Typography System)

#### 字体家族 (Font Families)
```css
--font-display: 'DIN Condensed', 'DIN Pro', -apple-system, sans-serif  /* 显示字体 - 价格、数字 */
--font-system: -apple-system, BlinkMacSystemFont, ...                   /* 系统字体 - 正文 */
```

**使用场景：**
```css
.price {
  font-family: var(--font-display);  /* 价格数字 */
}

.asset-value {
  font-family: var(--font-display);  /* 资产数字 */
}

/* 工具类 */
.font-din { font-family: var(--font-display); }
.font-display { font-family: var(--font-display); }
```

---

## 🚀 AI 编程指令模板

### 创建新组件时的标准指令

```
创建一个新的商品卡片组件，要求：

必须严格使用 app.wxss 中定义的设计令牌：
- 背景色使用 var(--card-surface)
- 圆角使用 var(--card-radius-sm)
- 阴影使用 var(--shadow-product)
- 价格颜色使用 var(--color-accent)
- 价格字体使用 var(--font-display)
- 渐变背景使用 var(--bg-gradient-*)
- 过渡效果使用 var(--duration-fast) 和 var(--ease-smooth)
- 按压效果使用 var(--transform-scale-press)

禁止使用任何十六进制颜色代码（#XXXXXX）！
禁止使用硬编码的 border-radius 数值！
禁止使用硬编码的 transition 时长！
```

### 修改现有样式时的标准指令

```
重构 user.wxss 文件，将所有硬编码的样式替换为设计令牌：

1. 所有 linear-gradient(...) 替换为 var(--bg-gradient-*)
2. 所有 #XXXXXX 颜色替换为 var(--color-*)
3. 所有 box-shadow: 0 Xrpx... 替换为 var(--shadow-*) 或 var(--card-shadow-*)
4. 所有 border-radius: XXrpx 替换为 var(--radius-*)
5. 所有 font-family: 'DIN...' 替换为 var(--font-display)
6. 所有 transition: XXs 替换为 var(--duration-*) 和 var(--ease-*)

验证每个修改确保视觉效果不变。
```

---

## 📖 实际案例 (Real Examples)

### ❌ 错误示例 (Wrong)
```css
.product-card {
  background: #ffffff;
  border-radius: 24rpx;
  box-shadow: 0 4rpx 20rpx rgba(15, 23, 42, 0.06);
  transition: all 0.3s;
}

.price {
  color: #d97706;
  font-family: 'DIN Condensed', sans-serif;
}

.buy-btn {
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
}

.card:active {
  transform: scale(0.98);
}
```

### ✅ 正确示例 (Correct)
```css
.product-card {
  background: var(--card-surface);
  border-radius: var(--card-radius-sm);
  box-shadow: var(--shadow-product);
  transition: all var(--duration-normal) var(--ease-smooth);
}

.price {
  color: var(--color-accent);
  font-family: var(--font-display);
}

.buy-btn {
  background: var(--bg-gradient-midnight);
}

.card:active {
  transform: var(--transform-scale-hover);
  box-shadow: var(--card-shadow-hover);
}
```

---

## 🎨 快速查找表 (Quick Reference)

| 用途 | 令牌 |
|------|------|
| 主按钮背景 | `var(--color-primary)` |
| 深色背景 | `var(--bg-gradient-midnight)` |
| 价格颜色 | `var(--color-accent)` |
| 价格字体 | `var(--font-display)` |
| 卡片背景 | `var(--card-surface)` |
| 卡片圆角 | `var(--card-radius)` |
| 产品卡片圆角 | `var(--card-radius-sm)` |
| 卡片阴影 | `var(--card-shadow-default)` |
| 浮动卡片阴影 | `var(--card-shadow-float)` |
| 按钮圆角 | `var(--radius-full)` |
| 标签圆角 | `var(--radius-sm)` |
| 按钮动画 | `var(--duration-fast)` + `var(--ease-smooth)` |
| 按压效果 | `var(--transform-scale-press)` |
| NEW徽章渐变 | `var(--bg-gradient-red)` |
| 标题颜色 | `var(--color-secondary)` |
| 描述文字 | `var(--color-text-sub)` |
| 弱化文字 | `var(--color-text-muted)` |

---

## ⚠️ 重要提醒 (Important Reminders)

1. **绝对禁止硬编码！** 任何 `#XXXXXX` 或数值都应该用变量替代
2. **统一圆角！** 主卡片用 `--card-radius` (32rpx)，产品卡片用 `--card-radius-sm` (24rpx)
3. **统一阴影！** 使用 `--card-shadow-*` 系列确保视觉一致
4. **统一过渡！** 使用 `--duration-*` 和 `--ease-*` 确保动画流畅一致
5. **数字用 DIN 字体！** 价格、资产、数据统计必须用 `var(--font-display)`

---

**最后检查清单：**
- [ ] 无任何 `#XXXXXX` 颜色代码
- [ ] 无硬编码的 `border-radius: XXrpx`
- [ ] 无硬编码的 `box-shadow: ...`
- [ ] 无硬编码的 `linear-gradient(...)`
- [ ] 无硬编码的 `transition: XXs`
- [ ] 所有价格使用 `var(--color-accent)` 和 `var(--font-display)`
- [ ] 所有卡片使用统一的 `--card-*` 令牌

---

**版本：** v1.0
**更新日期：** 2026-02-11
**维护者：** 臻选商城前端团队
