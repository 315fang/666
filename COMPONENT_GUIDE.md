# 组件使用指南

本文档详细说明如何使用项目中的可复用组件。

---

## 目录

- [Empty State 组件](#empty-state-组件)
- [Loading Skeleton 组件](#loading-skeleton-组件)
- [Order Card 组件](#order-card-组件)
- [Address Card 组件](#address-card-组件)
- [开发新组件](#开发新组件)

---

## Empty State 组件

用于显示空状态场景，如空购物车、无搜索结果、无订单等。

### 位置
`qianduan/components/empty-state/`

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| icon | String | `/assets/images/empty.svg` | 空状态图标路径 |
| title | String | `暂无数据` | 标题文本 |
| description | String | `''` | 描述文本（可选） |
| buttonText | String | `''` | 按钮文本（可选） |

### 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| buttonclick | 按钮点击事件 | - |

### 使用示例

#### 1. 在页面配置中引入组件

\`\`\`json
{
  "usingComponents": {
    "empty-state": "/components/empty-state/empty-state"
  }
}
\`\`\`

#### 2. 在 WXML 中使用

\`\`\`xml
<!-- 基础用法 -->
<empty-state
  title="购物车是空的"
/>

<!-- 带描述 -->
<empty-state
  icon="/assets/images/empty-cart.svg"
  title="购物车是空的"
  description="快去挑选心仪的商品吧"
/>

<!-- 带按钮 -->
<empty-state
  icon="/assets/images/empty-order.svg"
  title="暂无订单"
  description="您还没有任何订单记录"
  buttonText="去逛逛"
  bind:buttonclick="onGoShopping"
/>
\`\`\`

#### 3. 在 JS 中处理事件

\`\`\`javascript
Page({
  onGoShopping() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});
\`\`\`

### 应用场景

- 空购物车
- 无搜索结果
- 无订单记录
- 无收货地址
- 无团队成员
- 等其他空数据场景

---

## Loading Skeleton 组件

骨架屏加载组件，在数据加载时显示占位内容，提升用户体验。

### 位置
`qianduan/components/loading-skeleton/`

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| loading | Boolean | `true` | 是否显示加载状态 |
| type | String | `product-card` | 骨架屏类型 |
| count | Number | `1` | 重复次数（暂未实现） |

### 骨架屏类型

- `product-card`：商品卡片骨架屏
- `list-item`：列表项骨架屏（带头像）
- `order-card`：订单卡片骨架屏
- `custom`：自定义骨架屏（使用 slot）

### 使用示例

#### 1. 在页面配置中引入组件

\`\`\`json
{
  "usingComponents": {
    "loading-skeleton": "/components/loading-skeleton/loading-skeleton"
  }
}
\`\`\`

#### 2. 在 WXML 中使用

\`\`\`xml
<!-- 商品列表加载 -->
<loading-skeleton loading="{{loading}}" type="product-card">
  <view class="product-list">
    <view wx:for="{{products}}" wx:key="id" class="product-item">
      <!-- 商品内容 -->
    </view>
  </view>
</loading-skeleton>

<!-- 订单列表加载 -->
<loading-skeleton loading="{{loading}}" type="order-card">
  <view class="order-list">
    <order-card
      wx:for="{{orders}}"
      wx:key="id"
      order="{{item}}"
    />
  </view>
</loading-skeleton>

<!-- 用户列表加载 -->
<loading-skeleton loading="{{loading}}" type="list-item">
  <view class="user-list">
    <!-- 用户列表内容 -->
  </view>
</loading-skeleton>
\`\`\`

#### 3. 在 JS 中控制加载状态

\`\`\`javascript
Page({
  data: {
    loading: true,
    products: []
  },

  onLoad() {
    this.loadProducts();
  },

  async loadProducts() {
    this.setData({ loading: true });

    try {
      const res = await get('/products');
      this.setData({
        products: res.data,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  }
});
\`\`\`

### 最佳实践

1. **首次加载使用骨架屏**：用户首次进入页面时显示骨架屏
2. **下拉刷新不使用**：下拉刷新时已有内容，不需要骨架屏
3. **加载更多不使用**：滚动加载更多时，在底部显示简单的 loading
4. **匹配内容布局**：选择与实际内容布局相似的骨架屏类型

---

## Order Card 组件

订单卡片组件，统一的订单展示样式和交互。

### 位置
`qianduan/components/order-card/`

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| order | Object | `{}` | 订单对象 |
| showActions | Boolean | `true` | 是否显示操作按钮 |

### 订单对象结构

\`\`\`javascript
{
  order_no: String,      // 订单号
  status: String,        // 订单状态
  items: Array,          // 商品列表
  total_amount: Number,  // 订单总额
  // ... 其他字段
}
\`\`\`

### 商品项结构

\`\`\`javascript
{
  id: Number,
  product_name: String,     // 商品名称
  product_image: String,    // 商品图片
  sku_attrs: String,        // SKU 规格
  price: Number,            // 单价
  quantity: Number          // 数量
}
\`\`\`

### 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| cardtap | 点击卡片 | `{ order }` |
| pay | 点击支付按钮 | `{ order }` |
| cancel | 点击取消按钮 | `{ order }` |
| confirm | 点击确认收货按钮 | `{ order }` |
| viewcommission | 点击查看佣金按钮 | `{ order }` |

### 使用示例

#### 1. 在页面配置中引入组件

\`\`\`json
{
  "usingComponents": {
    "order-card": "/components/order-card/order-card"
  }
}
\`\`\`

#### 2. 在 WXML 中使用

\`\`\`xml
<!-- 基础用法 -->
<order-card
  wx:for="{{orders}}"
  wx:key="id"
  order="{{item}}"
  bind:cardtap="onViewOrderDetail"
/>

<!-- 完整用法 -->
<order-card
  order="{{orderItem}}"
  showActions="{{true}}"
  bind:cardtap="onViewOrderDetail"
  bind:pay="onPayOrder"
  bind:cancel="onCancelOrder"
  bind:confirm="onConfirmOrder"
  bind:viewcommission="onViewCommission"
/>

<!-- 只显示，不显示操作按钮 -->
<order-card
  order="{{orderItem}}"
  showActions="{{false}}"
/>
\`\`\`

#### 3. 在 JS 中处理事件

\`\`\`javascript
Page({
  // 查看订单详情
  onViewOrderDetail(e) {
    const { order } = e.detail;
    wx.navigateTo({
      url: \`/pages/order/detail?id=\${order.id}\`
    });
  },

  // 支付订单
  async onPayOrder(e) {
    const { order } = e.detail;

    wx.showModal({
      title: '确认支付',
      content: \`确认支付 ¥\${order.total_amount}？\`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await post('/orders/pay', { order_id: order.id });
            wx.showToast({ title: '支付成功' });
            this.loadOrders(); // 刷新列表
          } catch (err) {
            wx.showToast({ title: err.message, icon: 'none' });
          }
        }
      }
    });
  },

  // 取消订单
  onCancelOrder(e) {
    const { order } = e.detail;

    wx.showModal({
      title: '取消订单',
      content: '确认取消该订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await post('/orders/cancel', { order_id: order.id });
            wx.showToast({ title: '已取消订单' });
            this.loadOrders();
          } catch (err) {
            wx.showToast({ title: err.message, icon: 'none' });
          }
        }
      }
    });
  },

  // 确认收货
  onConfirmOrder(e) {
    const { order } = e.detail;

    wx.showModal({
      title: '确认收货',
      content: '确认已收到商品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await post('/orders/confirm', { order_id: order.id });
            wx.showToast({ title: '确认收货成功' });
            this.loadOrders();
          } catch (err) {
            wx.showToast({ title: err.message, icon: 'none' });
          }
        }
      }
    });
  },

  // 查看佣金
  onViewCommission(e) {
    const { order } = e.detail;
    wx.navigateTo({
      url: \`/pages/distribution/commission?order_id=\${order.id}\`
    });
  }
});
\`\`\`

### 状态说明

订单状态和对应的按钮显示：

| 状态 | 状态码 | 显示按钮 |
|------|--------|----------|
| 待付款 | `pending` | 取消订单、立即支付 |
| 已付款 | `paid` | - |
| 待发货 | `shipped` | 确认收货 |
| 已完成 | `completed` | 查看佣金 |
| 已取消 | `cancelled` | - |

---

## Address Card 组件

地址卡片组件，统一的收货地址展示和管理。

### 位置
`qianduan/components/address-card/`

### 属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| address | Object | `{}` | 地址对象 |
| selected | Boolean | `false` | 是否选中 |
| showCheckbox | Boolean | `false` | 是否显示复选框 |
| showActions | Boolean | `true` | 是否显示操作按钮 |
| showArrow | Boolean | `false` | 是否显示右侧箭头 |

### 地址对象结构

\`\`\`javascript
{
  id: Number,
  contact_name: String,     // 联系人姓名
  contact_phone: String,    // 联系电话
  province: String,         // 省份
  city: String,             // 城市
  district: String,         // 区县
  detail_address: String,   // 详细地址
  is_default: Boolean       // 是否默认地址
}
\`\`\`

### 事件

| 事件名 | 说明 | 回调参数 |
|--------|------|----------|
| cardtap | 点击卡片 | `{ address }` |
| edit | 点击编辑按钮 | `{ address }` |
| delete | 点击删除按钮 | `{ address }` |
| setdefault | 点击设为默认按钮 | `{ address }` |

### 使用示例

#### 1. 在页面配置中引入组件

\`\`\`json
{
  "usingComponents": {
    "address-card": "/components/address-card/address-card"
  }
}
\`\`\`

#### 2. 地址列表页面

\`\`\`xml
<!-- 地址管理页面 -->
<address-card
  wx:for="{{addresses}}"
  wx:key="id"
  address="{{item}}"
  showActions="{{true}}"
  showCheckbox="{{false}}"
  bind:edit="onEditAddress"
  bind:delete="onDeleteAddress"
  bind:setdefault="onSetDefaultAddress"
/>
\`\`\`

#### 3. 地址选择页面

\`\`\`xml
<!-- 选择地址页面（如结算页） -->
<address-card
  wx:for="{{addresses}}"
  wx:key="id"
  address="{{item}}"
  selected="{{selectedId === item.id}}"
  showCheckbox="{{true}}"
  showActions="{{false}}"
  showArrow="{{true}}"
  bind:cardtap="onSelectAddress"
/>
\`\`\`

#### 4. 在 JS 中处理事件

\`\`\`javascript
Page({
  data: {
    addresses: [],
    selectedId: null
  },

  // 选择地址
  onSelectAddress(e) {
    const { address } = e.detail;
    this.setData({ selectedId: address.id });

    // 如果是在结算页选择地址
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage) {
      prevPage.setData({ selectedAddress: address });
      wx.navigateBack();
    }
  },

  // 编辑地址
  onEditAddress(e) {
    const { address } = e.detail;
    wx.navigateTo({
      url: \`/pages/address/edit?id=\${address.id}\`
    });
  },

  // 删除地址
  onDeleteAddress(e) {
    const { address } = e.detail;

    wx.showModal({
      title: '删除地址',
      content: '确认删除该地址吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await del(\`/addresses/\${address.id}\`);
            wx.showToast({ title: '删除成功' });
            this.loadAddresses();
          } catch (err) {
            wx.showToast({ title: err.message, icon: 'none' });
          }
        }
      }
    });
  },

  // 设为默认地址
  async onSetDefaultAddress(e) {
    const { address } = e.detail;

    try {
      await put(\`/addresses/\${address.id}/default\`);
      wx.showToast({ title: '已设为默认地址' });
      this.loadAddresses();
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' });
    }
  }
});
\`\`\`

---

## 开发新组件

### 组件规范

创建新组件时，请遵循以下规范：

#### 1. 目录结构

\`\`\`
components/
└── my-component/
    ├── my-component.js     # 组件逻辑
    ├── my-component.json   # 组件配置
    ├── my-component.wxml   # 组件模板
    └── my-component.wxss   # 组件样式
\`\`\`

#### 2. 命名规范

- 组件名使用小写字母 + 连字符（kebab-case）
- 属性名使用驼峰命名（camelCase）
- 事件名使用全小写

#### 3. 组件模板

\`\`\`javascript
// my-component.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 属性定义
    title: {
      type: String,
      value: '',
      observer: function(newVal, oldVal) {
        // 属性变化时的回调
      }
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 内部数据
  },

  /**
   * 组件生命周期
   */
  lifetimes: {
    attached() {
      // 组件被添加到页面时
    },
    detached() {
      // 组件被移除时
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 内部方法
    _internalMethod() {
      // 私有方法以 _ 开头
    },

    // 事件处理
    onTap() {
      // 触发事件
      this.triggerEvent('tap', { data: 'value' });
    }
  }
});
\`\`\`

#### 4. 文档要求

每个新组件都应该包含：

1. **功能说明**：组件的用途和适用场景
2. **属性说明**：所有属性的说明和默认值
3. **事件说明**：所有事件的说明和参数
4. **使用示例**：至少 2 个使用示例
5. **注意事项**：使用时的注意事项和限制

#### 5. 代码规范

- 使用 CommonJS 模块系统
- 添加 JSDoc 注释
- 遵循项目代码规范
- 确保微信小程序兼容性

### 组件开发流程

1. **设计组件 API**
   - 确定属性和事件
   - 设计组件样式
   - 考虑扩展性

2. **实现组件**
   - 编写组件代码
   - 添加注释
   - 测试功能

3. **编写文档**
   - 更新本文档
   - 添加使用示例
   - 说明注意事项

4. **测试验证**
   - 在多个页面测试
   - 验证不同数据场景
   - 检查性能影响

5. **代码审查**
   - 提交 PR
   - 等待审查
   - 根据反馈修改

---

## 常见问题

### 1. 组件样式隔离

微信小程序默认启用样式隔离，组件内部样式不会影响外部。如需自定义样式，使用 `externalClasses`：

\`\`\`javascript
Component({
  externalClasses: ['custom-class'],
  // ...
});
\`\`\`

\`\`\`xml
<my-component custom-class="my-custom-style" />
\`\`\`

### 2. 组件通信

- **父 → 子**：通过属性传递数据
- **子 → 父**：通过事件触发 `triggerEvent`
- **兄弟组件**：通过父组件中转或使用全局 Store

### 3. 性能优化

- 避免频繁的 `setData`
- 使用 `data` 路径更新
- 大数据列表使用虚拟列表
- 图片使用懒加载

### 4. 兼容性

- 使用 CommonJS 模块（`module.exports`）
- 避免使用 ES6+ 不兼容特性
- 测试低版本微信客户端

---

## 更多资源

- [微信小程序组件开发文档](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/)
- [项目 README](../README.md)
- [前端优化报告](../Frontend-Optimization-Report.md)

---

**更新日期：** 2026-02-10
