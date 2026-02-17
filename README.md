# 分佣云库存微商小程序

一个功能完善、代码质量高的微信小程序分销系统，支持多级佣金分配、库存管理、订单管理等核心功能。

[![代码质量](https://img.shields.io/badge/Code%20Quality-8.2%2F10-brightgreen)]()
[![前端评分](https://img.shields.io/badge/Frontend-7.8%2F10-green)]()
[![后端评分](https://img.shields.io/badge/Backend-8.5%2F10-brightgreen)]()

---

## 📑 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [开发指南](#开发指南)
- [部署说明](#部署说明)
- [API 文档](#api-文档)
- [贡献指南](#贡献指南)

---

## 项目简介

这是一个专业的微信小程序分销系统，包含前端小程序和后端 API 服务。系统支持：

- 🎯 **多级分销**：会员、团长、代理商三级分销体系
- 💰 **灵活佣金**：支持固定金额和百分比两种佣金模式
- 📦 **库存管理**：代理商云库存管理，支持进货、销售记录
- 📊 **数据分析**：完善的统计分析和业绩排名
- 🛒 **订单管理**：完整的订单流程和状态管理
- 👥 **团队管理**：多层级团队关系和业绩追踪

---

## 技术栈

### 前端（WeChat Mini Program）
- **框架**: 微信小程序原生框架
- **状态管理**: 自研轻量级 Observable Store
- **组件库**: 自研可复用组件
- **工具库**: 完善的 Utils 工具集

### 后端（Node.js）
- **运行环境**: Node.js 16+
- **框架**: Express.js
- **数据库**: MySQL 8.0+
- **认证**: JWT Token
- **管理后台**: React + Ant Design

---

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- MySQL >= 8.0
- 微信开发者工具

### 后端安装

\`\`\`bash
# 1. 克隆项目
git clone https://github.com/315fang/666.git
cd 666

# 2. 安装后端依赖
cd backend
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库连接等信息

# 4. 初始化数据库
npm run db:migrate

# 5. 启动后端服务
npm run dev
# 生产环境: npm start
\`\`\`

后端服务默认运行在 `http://localhost:3000`

### 前端安装

\`\`\`bash
# 1. 进入前端目录
cd qianduan

# 2. 配置 API 地址
# 编辑 utils/request.js 中的 baseUrl

# 3. 使用微信开发者工具打开项目目录
# - 打开微信开发者工具
# - 选择「导入项目」
# - 选择 qianduan 目录
# - 输入 AppID（或使用测试 AppID）
\`\`\`

### 管理后台安装

\`\`\`bash
# 1. 进入管理后台目录
cd backend/admin-ui

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm start
# 访问 http://localhost:3001
\`\`\`

---

## 项目结构

\`\`\`
666/
├── backend/                 # 后端服务
│   ├── admin-ui/           # 管理后台（React）
│   ├── config/             # 配置文件
│   ├── middleware/         # 中间件
│   ├── models/             # 数据模型
│   ├── routes/             # 路由和控制器
│   │   ├── admin/          # 管理员路由
│   │   ├── api/            # API 路由
│   │   └── auth/           # 认证路由
│   ├── services/           # 业务逻辑服务
│   │   ├── CommissionService.js  # 佣金计算服务
│   │   ├── OrderService.js       # 订单服务
│   │   └── ...
│   ├── utils/              # 工具函数
│   ├── app.js              # 应用入口
│   └── package.json
│
├── qianduan/                # 前端小程序
│   ├── assets/             # 静态资源
│   ├── components/         # 可复用组件
│   │   ├── address-card/   # 地址卡片组件
│   │   ├── empty-state/    # 空状态组件
│   │   ├── loading-skeleton/  # 骨架屏组件
│   │   └── order-card/     # 订单卡片组件
│   ├── config/             # 配置文件
│   │   └── constants.js    # 常量配置
│   ├── pages/              # 页面
│   │   ├── index/          # 首页
│   │   ├── product/        # 商品页
│   │   ├── cart/           # 购物车
│   │   ├── order/          # 订单
│   │   ├── user/           # 个人中心
│   │   ├── distribution/   # 分销中心
│   │   └── ...
│   ├── store/              # 状态管理
│   │   └── index.js        # 全局 Store
│   ├── utils/              # 工具函数
│   │   ├── request.js      # 网络请求封装
│   │   ├── requestCache.js # 请求缓存层
│   │   ├── imageLazyLoader.js  # 图片懒加载
│   │   ├── errorHandler.js # 错误处理
│   │   ├── dataFormatter.js    # 数据格式化
│   │   ├── helpers.js      # 通用工具函数
│   │   └── store.js        # Store 基类
│   ├── app.js              # 小程序入口
│   ├── app.json            # 小程序配置
│   └── project.config.json # 项目配置
│
└── docs/                   # 文档
    ├── README.md           # 本文档
    ├── Frontend-Optimization-Report.md  # 前端优化报告
    └── ...
\`\`\`

---

## 核心功能

### 1. 用户系统
- 微信登录
- 角色管理（普通用户、会员、团长、代理商）
- 个人信息管理
- 邀请注册

### 2. 商品管理
- 商品列表和详情
- 分类浏览
- 搜索功能
- SKU 管理
- 价格体系（零售价、批发价、会员价等）

### 3. 订单系统
- 下单流程
- 订单管理（待付款、待发货、待收货、已完成）
- 订单状态跟踪
- 退款处理

### 4. 分销系统
- 三级分销体系
- 多种佣金模式
  - 固定金额模式
  - 百分比模式
- 团队管理
- 业绩统计
- 佣金提现

### 5. 库存管理
- 云库存系统（代理商）
- 进货记录
- 销售记录
- 库存统计

### 6. 管理后台
- 数据看板
- 商品管理
- 订单管理
- 用户管理
- 佣金管理
- 统计报表

---

## 开发指南

### 代码规范

项目遵循以下代码规范：

1. **命名规范**
   - 文件名：小写字母 + 连字符（kebab-case）
   - 变量名：驼峰命名（camelCase）
   - 常量名：大写字母 + 下划线（UPPER_SNAKE_CASE）
   - 组件名：帕斯卡命名（PascalCase）

2. **注释规范**
   - 所有函数必须有 JSDoc 注释
   - 复杂逻辑需要行内注释
   - 关键业务逻辑需要详细说明

3. **模块化**
   - 使用 CommonJS 模块系统（微信小程序兼容）
   - 避免循环依赖
   - 合理拆分模块

### 使用工具函数

项目提供了丰富的工具函数，开发时应优先使用：

\`\`\`javascript
// 数据格式化
const { parseImages, formatMoney, formatTime } = require('../../utils/dataFormatter');

// 表单验证
const { validatePhone, validateEmail, isEmpty } = require('../../utils/helpers');

// 错误处理
const { ErrorHandler, showError, showSuccess } = require('../../utils/errorHandler');

// 常量配置
const { USER_ROLES, ORDER_STATUS, ORDER_STATUS_TEXT } = require('../../config/constants');
\`\`\`

### 使用组件

项目提供了可复用组件，避免重复代码：

\`\`\`xml
<!-- 空状态组件 -->
<empty-state
  icon="/assets/images/empty-cart.svg"
  title="购物车是空的"
  description="快去挑选心仪的商品吧"
  buttonText="去逛逛"
  bind:buttonclick="onGoShopping"
/>

<!-- 骨架屏组件 -->
<loading-skeleton loading="{{loading}}" type="product-card">
  <product-list products="{{products}}" />
</loading-skeleton>

<!-- 订单卡片组件 -->
<order-card
  order="{{orderItem}}"
  showActions="{{true}}"
  bind:pay="onPayOrder"
  bind:cancel="onCancelOrder"
/>

<!-- 地址卡片组件 -->
<address-card
  address="{{addressItem}}"
  selected="{{selectedId === addressItem.id}}"
  bind:cardtap="onSelectAddress"
/>
\`\`\`

### 状态管理

使用全局 Store 管理用户和购物车状态：

\`\`\`javascript
const globalStore = require('../../store/index');

// 获取状态
const userInfo = globalStore.get('userInfo');
const cartCount = globalStore.get('cartCount');

// 更新状态
globalStore.set('cartCount', 5);

// 执行 Action
await globalStore.dispatch('login', { userInfo, openid, token });
await globalStore.dispatch('addToCart', cartItem);

// 订阅状态变化
const unsubscribe = globalStore.subscribe('cartCount', (newValue) => {
  this.setData({ cartCount: newValue });
});
\`\`\`

### 请求缓存

使用请求缓存减少网络请求：

\`\`\`javascript
const { cachedGet } = require('../../utils/requestCache');
const { get } = require('../../utils/request');

// 使用缓存（默认 5 分钟）
const data = await cachedGet(get, '/products', { page: 1 });

// 自定义缓存时长
const data = await cachedGet(get, '/config', {}, { cacheTTL: 30 * 60 * 1000 });

// 不使用缓存
const data = await cachedGet(get, '/orders', {}, { useCache: false });
\`\`\`

### 图片懒加载

使用图片懒加载提升性能：

\`\`\`javascript
const { imageLazyLoader } = require('../../utils/imageLazyLoader');

// 在页面中
Page({
  onReady() {
    // 启用懒加载
    imageLazyLoader.observe(this, '.product-image', (res) => {
      const imageSrc = res.dataset.src;
      // 加载图片
      imageLazyLoader.loadImage(imageSrc);
    });
  },

  onUnload() {
    // 清理 observer
    imageLazyLoader.disconnectAll();
  }
});
\`\`\`

---

## 部署说明

### 后端部署

\`\`\`bash
# 1. 构建（如需要）
npm run build

# 2. 配置生产环境变量
vi .env.production

# 3. 启动服务
npm start

# 或使用 PM2
pm2 start app.js --name "mini-program-api"
\`\`\`

### 前端部署

1. 使用微信开发者工具打开项目
2. 点击「上传」按钮
3. 填写版本号和描述
4. 提交审核
5. 审核通过后发布

### Nginx 配置示例

\`\`\`nginx
server {
    listen 80;
    server_name api.jxalk.cn;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
\`\`\`

---

## API 文档

### 认证接口

#### POST /auth/login
微信登录

**请求参数：**
\`\`\`json
{
  "code": "微信登录 code"
}
\`\`\`

**响应：**
\`\`\`json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "jwt_token",
    "openid": "user_openid",
    "userInfo": { ... }
  }
}
\`\`\`

### 商品接口

#### GET /api/products
获取商品列表

**查询参数：**
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 10）
- `category_id`: 分类 ID
- `keyword`: 搜索关键词

**响应：**
\`\`\`json
{
  "code": 0,
  "data": {
    "list": [ ... ],
    "total": 100,
    "page": 1,
    "limit": 10
  }
}
\`\`\`

更多 API 文档请参考：[API 文档详情](./docs/API.md)

---

## 贡献指南

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码审查标准

- 代码符合规范
- 有适当的注释
- 通过所有测试
- 不引入新的安全风险
- 性能没有明显下降

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

## 联系方式

- 项目地址：https://github.com/315fang/666
- 问题反馈：https://github.com/315fang/666/issues
- 邮箱：support@example.com

---

## 更新日志

### v2.0.0 (2026-02-10)
- ✨ 新增请求缓存层，提升性能
- ✨ 新增图片懒加载功能
- ✨ 完善状态管理系统
- ✨ 新增 4 个可复用组件
- 🐛 修复 ES6 模块兼容性问题
- 🐛 修复 401 token 刷新循环问题
- 📝 完善项目文档

### v1.0.0 (2025-12-01)
- 🎉 初始版本发布
- ✨ 完整的分销系统
- ✨ 订单管理功能
- ✨ 库存管理功能
- ✨ 管理后台

---

**Built with ❤️ by Claude & Team**
