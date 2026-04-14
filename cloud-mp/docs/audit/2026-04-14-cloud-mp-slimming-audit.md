# Cloud MP 瘦身审计

日期：2026-04-14  
范围：`admin-ui/`、`miniprogram/`、`cloudfunctions/`  
方法：静态扫描 + 现有审计文档复核  

## 1. 先说结论

这个工作区当前最值得优先瘦身的，不是“页面太多”，而是四类重复同时存在：

1. 小程序请求层保留了大量历史别名接口。
2. 用户、订单、支付、内容配置字段仍在多套别名之间兼容。
3. 云函数内部存在明显的复制式实现，而不是单点复用。
4. 小程序里有一批已注册但没有真实入口的页面，后台里还有一块“页面在线但接口是空壳”的区域。

额外说明：

- 当前工作区的真实后端主体是 `cloudfunctions/`，不是上层基线文档里写的 `backend/`。
- 本文只根据当前代码真相取证，不以上层旧描述做裁剪依据。

## 2. 最值得先砍的重复接口

### 2.1 小程序 `ROUTE_TABLE` 的同义接口

证据文件：

- [miniprogram/utils/request.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/utils/request.js:28)

这些路由当前明显是“同一动作挂多套名字”：

| 能力 | 当前并存接口 | 实际 action |
| --- | --- | --- |
| 用户资料读取 | `GET /user/profile`、`GET /user/info` | `user.getProfile` |
| 用户资料更新 | `PUT /user/profile`、`PUT /user/info` | `user.updateProfile` |
| 支付预下单 | `POST /orders/:id/pay`、`POST /orders/:id/prepay` | `payment.prepay` |
| 设置默认地址 | `PUT /addresses/:id/default`、`POST /addresses/:id/default` | `user.setDefaultAddress` |
| 分销总览 | `GET /distribution/overview`、`GET /distribution/center`、`GET /stats/distribution`、`GET /agent`、`GET /wallet` | `distribution.center` |
| 用户统计 | `GET /user/stats`、`GET /points`、`GET /points/summary` | `user.getStats` |
| 首页内容 | `GET /page-content/home`、`GET /page-content`、`GET /homepage-config` | `config.homeContent` |
| 商品搜索 | `GET /search`、`GET /products/search` | `products.search` |
| 佣金日志 | `GET /distribution/commission-logs`、`GET /commissions` | `distribution.commLogs` |
| 提现申请 | `POST /distribution/withdraw`、`POST /wallet/withdraw` | `distribution.withdraw` |
| 我的优惠券 | `GET /coupons/mine`、`GET /coupons` | `user.listCoupons` |

建议：

1. 为每类能力只保留一条正式 REST 名。
2. 旧 alias 先打 deprecated 标记，再按页面真实引用分批删除。
3. 小程序页面禁止继续新增 alias，只准接正式路由。

### 2.2 已注册但静态扫描未命中的旧接口

以下接口在当前小程序业务代码里未扫到直接调用，优先怀疑为兼容残留：

- `GET /user/info`
- `PUT /user/info`
- `POST /orders/:id/pay`
- `PUT /addresses/:id/default`
- `GET /distribution/center`
- `GET /agent`
- `GET /wallet`
- `GET /points`
- `GET /points/summary`
- `GET /coupons`

说明：

- 这些接口大多都能在 [miniprogram/utils/request.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/utils/request.js:28) 找到。
- 这是一轮静态扫描结论，不代表线上绝对无人访问；但足以作为“先冻结、再追调用、再移除”的候选集。

## 3. 字段重复与别名漂移

这部分以当前真相文档和代码兼容链为准，优先处理那些已经横跨三端的字段。

参考文档：

- [docs/audit/2026-04-13-three-part-field-flow-audit.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-13-three-part-field-flow-audit.md:1)
- [docs/audit/2026-04-14-user-distribution-field-truth.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-14-user-distribution-field-truth.md:1)
- [docs/audit/2026-04-14-config-content-field-truth.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-14-config-content-field-truth.md:1)

### 3.1 用户身份与关系字段

证据：

- [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:1363)
- [cloudfunctions/admin-api/src/admin-marketing.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js:239)
- [cloudfunctions/order/order-query.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/order/order-query.js:203)

当前并存：

| 领域 | 正式字段 | 兼容字段 |
| --- | --- | --- |
| 用户主身份 | `openid` | `id`、`_id`、`_legacy_id` |
| 上级关系 | `referrer_openid` | `parent_openid`、`parent_id` |

问题：

- `findUserByAnyId` 和“上级回溯”逻辑已经散落到多个域。
- `parent_id`、`parent_openid`、`referrer_openid` 同时参与业务判断，导致任何新功能都必须写兼容链。

建议：

1. 外部 DTO 只保留 `id` + `openid`。
2. 推荐关系只保留 `referrer_openid` 为正式业务字段。
3. `parent_id` 保留作引用字段，不再扩散到展示与判断层。

### 3.2 用户展示字段

证据：

- [admin-ui/src/utils/userDisplay.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/utils/userDisplay.js:1)
- [miniprogram/utils/userProfile.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/utils/userProfile.js:1)

当前并存：

| 正式字段 | 兼容字段 |
| --- | --- |
| `nickname` | `nickName`、`nick_name` |
| `avatar_url` | `avatarUrl`、`avatar` |
| `role_level` | `distributor_level`、`level` |
| `role_name` | `level_name` |

问题：

- 用户基础 DTO 现在已经在同时吐驼峰和下划线两套字段。
- 前端多个页面还在各自兜底，不是统一消费同一层用户格式化结果。

### 3.3 余额字段

证据：

- [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:2119)
- [cloudfunctions/admin-api/src/admin-marketing.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/admin-marketing.js:93)
- [miniprogram/pages/user/userDashboard.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/pages/user/userDashboard.js:459)

当前并存：

| 正式字段 | 兼容字段 |
| --- | --- |
| `commission_balance` | `balance` |
| `goods_fund_balance` | `agent_wallet_balance`、`wallet_balance` |

问题：

- 管理端、后台、分销页都在自己判断“哪个余额字段才是真的”。
- `balance` 还在混用为佣金余额或钱包余额，语义不稳定。

建议：

1. 佣金只认 `commission_balance`。
2. 货款只认 `goods_fund_balance`。
3. `balance`、`agent_wallet_balance`、`wallet_balance` 只做过渡输出，禁止新增使用点。

### 3.4 订单金额与支付字段

证据：

- [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:1112)
- [miniprogram/pages/order/orderConsumerFields.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/pages/order/orderConsumerFields.js:53)
- [docs/audit/2026-04-11-order-field-audit.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-11-order-field-audit.md:1)

当前并存：

| 领域 | 正式字段候选 | 兼容字段 |
| --- | --- | --- |
| 订单金额 | `pay_amount`、`total_amount` | `actual_price` |
| 支付方式 | `payment_method` | `pay_channel`、`pay_type`、`payment_channel` |
| 订单状态 | `pending_payment` | 前端筛选态 `pending` |

问题：

- 小程序订单消费层和后台管理层都在自己做支付字段归一化。
- `actual_price` 仍被一些链路用作实付金额回退，统计口径容易漂。

建议：

1. 实付统一收口到 `pay_amount`。
2. 原价/应付统一收口到 `total_amount` 或单独定义新字段，但不要继续复用 `actual_price`。
3. 支付方式只保留 `payment_method`。

### 3.5 内容与配置字段

证据：

- [cloudfunctions/admin-api/src/config-contract.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/config-contract.js:169)
- [cloudfunctions/config/config-contract.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/config/config-contract.js:142)
- [miniprogram/utils/miniProgramConfig.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/utils/miniProgramConfig.js:176)

当前并存：

| 正式字段 | 兼容字段 |
| --- | --- |
| `feature_flags` | `feature_toggles` |
| `miniProgramConfig` | `mini_program_config` |
| `popupAd` | `popup_ad` |
| `section_key` | `board_key`、`key` |
| `section_name` | `board_name`、`name`、`title` |
| `section_type` | `board_type` |
| `is_visible` | `status`、`enabled` |

问题：

- 配置与内容位已经进入 DTO 兼容期，但旧字段还在多个页面与接口中继续被读写。
- `status`、`enabled` 仍可能与 `is_visible` 混用，后面继续堆功能会更难收口。

## 4. 重复实现与低价值代码

### 4.1 云函数 shared 目录是复制式分发

当前检测到完全相同的公共文件被复制到 11 处：

- `shared/errors.js`
- `shared/growth.js`
- `shared/response.js`
- `shared/utils.js`
- `shared/validators.js`

涉及目录：

- `cloudfunctions/shared/`
- `cloudfunctions/admin-api/shared/`
- `cloudfunctions/cart/shared/`
- `cloudfunctions/config/shared/`
- `cloudfunctions/distribution/shared/`
- `cloudfunctions/login/shared/`
- `cloudfunctions/order/shared/`
- `cloudfunctions/order-timeout-cancel/shared/`
- `cloudfunctions/payment/shared/`
- `cloudfunctions/products/shared/`
- `cloudfunctions/user/shared/`

结论：

- 这不是“合理多入口”，这是“同一套基建拷贝了 11 份”。
- 任何一个 bug 修复都需要多点同步，长期一定漂。

### 4.2 相同查询/归一化函数被重复实现

证据：

- [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:1420)
- [cloudfunctions/distribution/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/distribution/index.js:237)
- [cloudfunctions/order/order-create.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/order/order-create.js:84)
- [cloudfunctions/order/order-query.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/order/order-query.js:203)
- [cloudfunctions/user/user-wallet.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/user/user-wallet.js:42)
- [cloudfunctions/user/user-coupons.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/user/user-coupons.js:90)

重复项：

| 函数/能力 | 重复位置 |
| --- | --- |
| `findUserByAnyId` | `admin-api`、`distribution`、`order-create`、`order-query` |
| `findCollectionDocByAnyId` | `order-query` 内自实现，与 `admin-api` 的 lookup 思路重复 |
| `normalizeScopeIds` | `order-create`、`user-wallet` |
| `queryUserCouponsByUserIds` | `user-wallet`、`user-coupons` |

建议：

1. 把“按任意 ID 找用户/文档”收口成共享 lookup 模块。
2. 把优惠券 scope 归一化收口成单点 helper。
3. 先做只读查询共享，再处理写路径。

### 4.3 后台存在“页面在线但接口是空壳”的区域

证据：

- [admin-ui/src/views/system-config/index.vue](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/views/system-config/index.vue:229)
- [cloudfunctions/admin-api/src/app.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/admin-api/src/app.js:7115)

当前后端这些接口全部是空壳返回：

- `GET /admin/api/system-configs` -> `list: []`
- `POST /admin/api/system-configs/batch` -> `success: true`
- `POST /admin/api/system-configs/refresh-cache` -> `success: true`
- `GET /admin/api/system-configs/:configKey/history` -> `list: []`
- `POST /admin/api/system-configs/:configKey/rollback` -> `success: true`
- `GET /admin/api/db-indexes/tables` -> `list: []`
- `GET /admin/api/db-indexes/:tableName` -> `list: []`
- `GET /admin/api/db-indexes/:tableName/columns` -> `list: []`
- `POST /admin/api/db-indexes` -> `success: true`
- `DELETE /admin/api/db-indexes/:tableName/:indexName` -> `success: true`

结论：

- `系统配置` 页当前不是“功能薄”，而是“前端已接入，后端仍是假接口”。
- 这类页面不适合继续维护展示层，应优先决定：补真实后端，或直接下线入口。

## 5. 注册了但当前没有真实入口的页面

### 5.1 小程序静态扫描未命中的注册页面

证据文件：

- [miniprogram/app.json](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/app.json:1)

当前注册但未扫到外部导航/入口引用的页面：

| 页面 | 当前判断 |
| --- | --- |
| `pages/activity/n-invite` | 只在自身分享 path 中回填，未看到外部入口，疑似半废弃分享页 |
| `pages/user/favorites` | 已并入 `favorites-footprints`，当前只剩兼容跳转壳 |
| `pages/user/footprints` | 已并入 `favorites-footprints`，当前只剩兼容跳转壳 |
| `pages/user/growth-privileges` | 用户页入口已改跳 `membership-center`，当前疑似死页 |
| `pages/user/member-levels` | 页面存在，但未看到任何入口 |
| `pages/user/ticket-list` | 页面存在，但未看到任何入口 |
| `pages/product/reviews` | 页面存在，但商品详情未导航过去 |
| `pages/wallet/recharge-order` | 页面存在且有接口，但未看到任何入口 |

### 5.2 已明确变成兼容壳的页面

证据：

- [miniprogram/pages/user/favorites.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/pages/user/favorites.js:1)
- [miniprogram/pages/user/footprints.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/pages/user/footprints.js:1)

当前行为：

- `favorites.js` 只做 `redirectTo('/pages/user/favorites-footprints?tab=favorites')`
- `footprints.js` 只做 `redirectTo('/pages/user/favorites-footprints?tab=footprints')`

建议：

1. 如果线上已经没有旧链接依赖，这两页可以直接取消注册。
2. 如果还要兼容旧分享或旧收藏入口，就保留 1 个版本周期后再删。

### 5.3 已被新页面替代的会员页

证据：

- [miniprogram/pages/user/user.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/miniprogram/pages/user/user.js:198)

当前 `onGrowthPrivilegesTap()` 实际跳转的是：

- `/pages/user/membership-center`

不是：

- `/pages/user/growth-privileges`
- `/pages/user/member-levels`

这说明会员体系已有新入口，旧两页至少不是主链。

## 6. 后台页面注册情况

### 6.1 管理端没有发现“文件在但没挂路由”的 `index.vue`

静态结果：

- `admin-ui/src/views/**/index.vue` 当前都已挂到 [admin-ui/src/router/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/router/index.js:1)

这部分说明：

- 管理端问题不是“有一堆没注册页面文件”。
- 真问题是“路由在线，但后端接口可能是兼容层或空壳”。

### 6.2 `logistics` 是注册但隐藏的路由

证据：

- [admin-ui/src/router/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/admin-ui/src/router/index.js:54)

当前状态：

- 已注册：`path: 'logistics'`
- 已隐藏：`nav: false`
- 当前静态扫描未发现其它前端路由跳转引用

结论：

- 这不是死页面，因为页面文件和接口都还在用。
- 但它不是标准导航主链，更像“隐式入口页”。

## 7. 建议的瘦身顺序

### 第一批：高收益、低风险

1. 冻结小程序 `ROUTE_TABLE`，不再新增 alias。
2. 标记并准备移除未命中的 alias 接口。
3. 清理 `favorites` / `footprints` 这类纯兼容壳页面。
4. 把 `system-configs` / `db-indexes` 这类空壳接口和页面列入下线或补全决策。

### 第二批：核心契约收口

1. 用户关系字段只留 `referrer_openid` 为正式业务真相。
2. 余额字段只留 `commission_balance` 和 `goods_fund_balance`。
3. 支付方式只留 `payment_method`。
4. 内容位只留 `section_*` 与 `is_visible`。

### 第三批：代码去重

1. 合并 11 份 `shared/*`。
2. 提取统一的 `findUserByAnyId` / lookup helper。
3. 合并优惠券 scope 与用户券查询 helper。

## 8. 这轮审计最该先落地的删除候选

如果只允许先做一轮最小瘦身，我建议先处理这 8 项：

1. 小程序 `GET /user/info` / `PUT /user/info`
2. 小程序 `POST /orders/:id/pay`
3. 小程序 `PUT /addresses/:id/default`
4. 小程序分销中心历史 alias：`/distribution/center`、`/agent`、`/wallet`
5. `pages/user/favorites`
6. `pages/user/footprints`
7. `pages/user/growth-privileges`
8. `system-configs` / `db-indexes` 这整组空壳接口与其页面入口

这些项的共同特点是：

- 兼容价值低
- 真实主链已有替代
- 继续维护只会增加心智负担
