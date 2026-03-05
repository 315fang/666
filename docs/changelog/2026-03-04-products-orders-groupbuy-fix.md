# 2026-03-04 核心业务模块增强与修复

## 1. 商品管理相关修复 (P0)
- **后端 (`backend/routes/admin/controllers/adminProductController.js`)**:
  - 重构了 `createProduct` 和 `updateProduct` 接口。
  - 支持了 `cost_price`、`custom_commissions`、`enable_coupon`、`enable_group_buy` 等营销及价格字段，解决了前端传递了参数但后端之前不接收入库的严重 Bug。
  - 修复了因为 `price_member` 变量未转换引起的各类创建失败报错。
- **前端 (`backend/admin-ui/src/views/products/index.vue`)**:
  - 彻底重写发布页面，采用了清晰的“Three-Tab (三标签)”分类结构：基础信息、价格与库存、营销与设置。
  - 补全了素材库URL插入商品图的功能入口，支持多图及独立分销比例设定。

## 2. 订单管理功能补全
- **前端 (`backend/admin-ui/src/views/orders/index.vue`)**:
  - 补全了顶部日期区间搜索能力。
  - 列表加入了显示买家身份及 `role_level` 等级标签。
  - 实装了之前后端有接口但前端没页面的能力：**管理员给订单加私密备注**、**协商改价(修改实际订单金额)**、**强制取消并退款**、**强制完成收货**。

## 3. 拼团活动管理模块 (新增)
- **后端**: 
  - 新建 `backend/routes/admin/controllers/adminGroupBuyController.js`，实现活动数据的增删改查。
  - 在 `routes/admin/index.js` 添加 `/group-buys` 相关权限路由。
- **前端**:
  - 新增 `admin-ui/src/views/group-buy/index.vue` 活动配置与管理页面，可绑定商品、调整拼团成团人数和有效时限。
  - 更新了 `@/api/index.js` 和 `@/router/index.js`，将拼团模块放置在【核心运营】菜单下。

## 验证结论
核心管理面板的逻辑已彻底打通，商品从独立属性到营销开关的设置能够完美保存，为小程序端提供了精确的数据源支持。订单后置操作不再需要触碰数据库即可处理售后纠纷情况。拼团也拥有了独立的配置中心。
