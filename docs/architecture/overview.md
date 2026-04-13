# 当前技术总览

本文档是当前仓库的主技术文档入口。若与历史设计稿、旧计划或根目录旧文件冲突，以本文档和当前代码为准。

## 1. 当前主技术边界

### 1.1 现行主系统

- `backend/`: Node.js + Express + Sequelize + MySQL
- `admin-ui/`: Vue 3 + Vite + Pinia + Element Plus
- `miniprogram/`: 微信原生小程序

这三部分共同构成当前主业务的真实运行面。

### 1.2 保留但不是主前端的部分

- `backend` 仍维护 `/api/portal/*` 门户接口和相关鉴权能力
- 当前仓库内不存在可作为主线维护对象的 `agent-portal/` 前端目录

这意味着“门户能力仍在后端保留”，但“门户前端源码不应再当作当前仓库事实”。

### 1.3 演进/迁移线

- `cloud-mp/`
- `backend/cloudrun-admin-service/`

它们属于 CloudBase 迁移和后台演进线，当前不应覆盖现网主系统口径。

## 2. 当前请求面与系统分工

### 2.1 用户侧与公开接口

后端通过 `backend/app.js` 暴露：

- `/api/*`: 用户登录、商品、购物车、订单、退款、内容、活动、配置等
- `/api/agent/*`: 标准代理工作台、货款钱包、发货等
- `/api/n/*`: N 路径邀约、货款、升级等
- `/api/portal/*`: 门户后端接口
- `/api/docs`: Swagger
- `/health`: 健康检查

### 2.2 管理端接口

- `/admin/api/*`: 管理后台专用接口

管理后台由 `admin-ui` 提供 UI，后端负责鉴权、权限校验、业务处理和日志。

## 3. 后端当前结构

### 3.1 主要分层

- `routes/`: 路由注册与中间件装配
- `controllers/`: request / response 薄层
- `services/`: 业务逻辑主承载
- `models/`: Sequelize 模型与关联
- `middleware/`: 鉴权、权限、错误处理、校验
- `utils/`: 通用工具和基础设施能力

### 3.2 当前关键服务域

当前最关键的服务不在单一“商城”域，而是分布在：

- 订单与支付：`OrderCoreService`、`OrderCreationService`、`OrderPaymentService`
- 佣金与价格：`CommissionService`、`PricingService`
- 代理与货款：`AgentService`、`AgentWalletService`
- N 路径：`NSystemService`、`UpgradeMemberService`
- 内容与编排：`BoardService`、`PageLayoutService`

## 4. 管理端当前结构

### 4.1 主要目录

- `src/router/`: 页面路由、菜单分组、权限入口
- `src/store/`: 登录态与全局状态
- `src/api/`: 后台接口封装
- `src/views/`: 页面级业务视图
- `src/config/`: 角色预设和共享配置
- `src/utils/`: 请求封装和格式化工具

### 4.2 当前页面分组

管理端已经按业务域形成稳定入口：

- 经营概览
- 商品与营销
- 订单与资金
- 用户与渠道
- 内容与设计
- 业务策略
- 平台与运维

这和 `admin-ui/src/router/index.js` 中的真实菜单结构保持一致。

## 5. 小程序当前结构

### 5.1 页面组织

小程序通过 `miniprogram/app.json` 拆成：

- 主包：首页、分类、活动、购物车、用户中心、商品详情、搜索
- 订单分包
- 自提/门店分包
- 分销中心分包
- 钱包分包
- 积分、抽奖、优惠券、砍价、拼团分包

### 5.2 当前技术特点

- 原生 Page + WXML/WXSS
- 请求统一走 `utils/request.js`
- 登录态、用户资料、页面配置由全局与工具层协同管理

## 6. 当前技术风险

- `backend/server.js` 仍然职责过重
- 订单主链路仍有历史兼容逻辑
- 管理端和小程序都还有多个大文件
- CloudBase 迁移线与现网主线并存，容易形成双真相

## 7. 当前应该怎么读文档

1. 先看 [`项目业务总览.md`](./项目业务总览.md) 明确业务范围
2. 再看 [`backend.md`](./backend.md)、[`admin-ui.md`](./admin-ui.md)、[`miniprogram.md`](./miniprogram.md)
3. 需要接口/页面细节时再看 `internals/` 和 `guides/`

## 8. 当前文档使用规则

- `docs/前端.md` 和 `docs/手册.md` 只作为操作补充，不再承载主技术事实
- 根目录旧命名文档只作为兼容入口或专题说明，不再覆盖 `docs/architecture/`
