# cloud-mp 综合体检审计报告

日期：2026-04-20  
范围：`cloud-mp/` 当前主工程；上层 `zz/` 仅用于证明真相源冲突  
方法：文档对比、定点代码审计、本地命令复核

## 1. 执行摘要

本轮结论不是“项目不能跑”，而是“项目已经形成一条可运行主线，但它的真相源、权限边界、写路径边界和文档边界都还不可信”。

2026-04-20 已复核的可运行基线如下：

- `npm run check:foundation`：通过
- `node --test "cloudfunctions/admin-api/test/*.test.js"`：通过
- `npm run audit:miniprogram-routes`：通过
- `cd admin-ui && npm run build`：通过

但这些结果只能证明当前存在一条 CloudBase 主线，并不能证明下列问题已经收口：

1. 上层旧仓库上下文仍在持续输出与 `cloud-mp` 不一致的说明，会误导协作。
2. `cloud-mp/` 根目录和 `docs/` 顶层虽然已经开始归档，但仍被工具目录、阶段产物与历史快照抢占解释权。
3. `cloudfunctions/admin-api/src/app.js` 仍承担过多职责，且高风险写路径还在混用“精确 patch”和“整集合写回”。
4. `admin-ui` 的权限真相仍分散在路由、导航、页面闸门和后端接口多个层面。
5. `miniprogram` 的首批交易硬故障虽然已修，但交易规则保护与登录态收尾仍未完全做实。

同轮已完成的首批修复：

- 修复了订单详情页 `resolveCloudImageUrl` 未引入导致的运行时错误
- 修复了积分抵扣比例被前端错误强抬到至少 `70%` 的问题
- 为 `admin-api` 的 `runtime/data-source`、`operations/dashboard`、`GET mini-program-config` 补齐了权限校验
- 收口了 `admin-ui` 中 `群发消息`、`会员策略`、`ops-monitor debug` 的一批权限漂移
- 清理了 `dashboard/users/orders` 页面里几处无权限时仍偷偷请求配置的静默失败点
- 将订单改价接口收紧为“仅未支付且未进入退款/佣金链的订单允许改价”，并补齐原因字段与回归测试
- 将提现审核链从 `directPatchDocument + patchCollectionRow/saveCollection` 双写收口为单路精确写入
- 将退款执行主链里一批 `refunds/orders` 双写改为单路精确写入
- 将单笔佣金审批/驳回从整集合写回收口为精确写入，并补齐回归测试
- 将小程序内部登录态判断从 `openid + token` 双依赖收口到 `openid + userInfo`，并清理登录失效处理与网页端链接复制中的 `token` 残留
- 将批量佣金审批/驳回在 `db` 模式下改为精确写入，并补齐回归测试
- 将 `users` 资金链（货款/积分/成长值/佣金/欠款处理）统一到同一套精确写入与回滚模式
- 将小程序登录恢复 / 登录成功 / 登出 / 登录失效处理中的遗留 `token` 缓存清理统一到同一行为
- 将小程序 `auth.js` 的登录态守卫也收口到 `openid + userInfo`，避免工具层与 store/appAuth 各用一套判断
- 为 `admin-ui` 增加轻量 `check` 脚本，静态扫描高权限配置 API 的使用面，并收口 `home-sections` 的高权限页签入口
- 将退款链里的佣金恢复/取消 helper 也切到退款相关调用面的强一致写法，进一步压缩 `users/commissions` 整集合写回
- 删除小程序认证常量里的 `TOKEN` 死配置，并将 `requestAuth` 的登录失效处理也切到当前统一的 app 级登出/重登流程
- 新建 `docs/archive/root-artifacts/`，继续将根目录临时图片、调试文本、一次性 JSON 与旧构建碎片移出主入口层
- 为 `.tmp-*`、`.codex_tmp_*`、`tmp_*` 以及若干临时目录补齐 `.gitignore`，降低这类产物再次回流根目录的概率
- 将 `admin-api` 的系统/设置/会员配置/调试路由拆到独立模块 `cloudfunctions/admin-api/src/admin-system.js`
- 将 `admin-api` 的财务看板 / 提现 / 佣金相关路由拆到独立模块 `cloudfunctions/admin-api/src/admin-finance.js`
- 将 `admin-api` 的退款路由拆到独立模块 `cloudfunctions/admin-api/src/admin-refunds.js`，并完成 `app.js` 主入口切换
- 新建 `docs/archive/root-history/`，将一批根目录历史阶段资料从主入口层归档移走
- 将根目录 `.tmp-admin-api-node_modules-backup/`、`.tmp-pdf-pages/`、`.tmp-pdf-review/` 直接清出工作区，并把 `xiufu/` 归档到 `docs/archive/root-history/xiufu/`

一句话判断：

- 运行主线：存在
- 工程可信度：中低
- 当前首要任务：先恢复“单一真相源 + 单一权限真相 + 单一高风险写路径规则”，再谈继续扩功能

## 2. 真相源与边界冲突

### 2.1 上层旧上下文仍在误导 `cloud-mp` 主线判断

- 类型：真相源
- 证据：
  - `zz/README.md:3-7` 仍把项目边界定义为 `backend/`、`admin-ui/`、`miniprogram/`
  - `zz/docs/audit/2026-04-06-repo-audit.md:4-5` 仍以 `backend/` 作为审计范围核心
  - `zz/docs/rules/project-collaboration-rules.md:13-27` 又把 `backend/admin-ui/miniprogram` 定义成“现网主系统”，把 `cloud-mp` 定义成“CloudBase 迁移目标”
  - `cloud-mp/README.md:3-4` 已明确声明 `cloud-mp` 是当前仍在维护的主工程，运行主线已经切到 CloudBase
- 影响面：
  - 协作者、AI、审计脚本会继续被旧 `zz/` 上下文带偏
  - 同一轮排障和修复可能错误地切回 `backend` 旧路径
- 为什么现在就该排到前面：
  - `cloud-mp` 已经被确定为唯一主线，外部旧上下文就应该被降级成历史资料
  - 如果不先明确这一点，后续“收口、修复、优化”会不断被旧目录干扰

### 2.2 `cloud-mp/` 根目录仍在发生解释权竞争

- 类型：仓库边界 / 工程可信度
- 证据：
  - 同层文档：`README.md`、`PROJECT_OVERVIEW.md`、`DOCUMENTATION_GUIDE.md`、`DOCUMENTS.md`
  - 根目录仍直接暴露工具/协作目录：`.agents/`、`.claude/`、`skills/`、`specs/`
  - 同层映射与迁移资料：`CLOUD_DB_SCHEMA.md`、`CLOUDBASE_TARGET_MODEL.md`、`MYSQL_TO_CLOUDBASE_MAPPING.md`
  - 本轮虽已将 `plan.md`、`CODE_REVIEW.md`、`FINAL_DELIVERY_SUMMARY.md`、`EXECUTION_SUMMARY.txt` 迁入 `docs/archive/root-history/`，但主入口仍不是“单一 README + 单一导航”结构
- 量化结果：
  - 当前工作树约有 `415` 个 `.md`
  - `docs/` 顶层约有 `49` 个 `.md`
- 影响面：
  - 根目录解释权已经比首轮更收敛，但进入仓库的人首先看到的仍不是单一主入口
  - 仓库边界看起来仍像“项目 + 工具运行环境 + 历史迁移资料”的混合物
- 为什么现在就该排到前面：
  - 这会直接拖垮后续协作效率
  - 文档和产物如果继续与主入口同层暴露，后续任何收口都会被新噪音冲掉

### 2.3 `docs/` 顶层还没有完成长期规则与一次性快照分层

- 类型：文档真相 / 信息架构
- 证据：
  - 当前主说明：`docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`、`docs/CLOUDBASE_RELEASE_RUNBOOK.md`
  - 当前审计快照：`docs/AUDIT_ALL_SUMMARY.md`、`docs/ADMIN_*`、`docs/*_AUDIT.md`
  - 阶段总结：`docs/P1_FIXES_SUMMARY.md`、`docs/P2_COMPLETE_SUMMARY.md`
  - 运行证据：`docs/release/evidence/*`
- 影响面：
  - `docs/` 顶层同时承担“真相源、审计结果、运行证据、阶段总结、生成物输出”多种角色
  - 阅读者很难快速判断一份文档是长期规则还是某个时间点快照
- 为什么现在就该排到前面：
  - 这已经不是“文档多”，而是“文档角色未分层”
  - 文档越多而分层越弱，后续越难恢复可信入口

## 3. 分维度发现

### 3.1 仓库卫生与品牌叙事

#### P1. 项目外显名称已经发生多点漂移

- 类型：品牌叙事 / 协作命名
- 证据：
  - `admin-ui/index.html:7-8` 使用 `S2B2C 数字化加盟系统`、`S2B2C 管理台`
  - `admin-ui/src/layout/index.vue:20` 侧边栏标题是 `S2B2C 管理台`
  - `admin-ui/src/views/login/index.vue:11-12` 登录页继续使用 `S2B2C 管理台`、`数字化加盟系统后台管理平台`
  - `miniprogram/app.json:168-189` 使用 `臻选系列`、`礼遇精选`、`我的会籍`、导航栏标题 `臻选`
  - `miniprogram/app.js:31-34` 使用 `问兰`、`问兰 · 品牌甄选`
- 影响面：
  - 对内：检索词、页面归属、需求讨论、文档命名会持续漂
  - 对外：同一产品在后台、小程序、配置、文档里像不同品牌
- 为什么现在就该排到前面：
  - 命名漂移会直接放大信息架构混乱
  - 这是“真相源混乱”的外显症状，不只是品牌文案问题

### 3.2 Backend / `admin-api`

#### P1. 后台权限首轮收口已完成，但权限真相仍依赖散点路由声明与局部测试

- 类型：权限 / 工程可信度
- 证据：
  - `cloudfunctions/admin-api/src/app.js:4744`：`/admin/api/runtime/data-source` 已收口为 `settings_manage`
  - `cloudfunctions/admin-api/src/app.js:7986`：`/admin/api/operations/dashboard` 已收口为 `dashboard`
  - `cloudfunctions/admin-api/src/admin-system.js:111-113`：`mini-program-config` 已收口为 `settings_manage`
  - `cloudfunctions/admin-api/src/admin-system.js:240-318`：`debug/*` 已收口为 `super_admin`
  - `cloudfunctions/admin-api/test/validation-contract.test.js:553-591`：目前只补了低权限拒绝的定点校验
- 影响面：
  - 最直接的 `auth-only` 缺口已经补上，但权限规则仍分散在 `app.js`、拆分模块与前端菜单口径里
  - 一旦后续继续迁移路由或前后端再次漂移，现有测试仍不足以形成系统级保护
- 为什么现在就该排到前面：
  - 权限现在不再是“裸奔”，但也还没有形成统一声明或矩阵
  - 收口阶段如果不把权限真相继续往单一来源推进，回归风险会重新累积

#### P1. 改价写路径没有同步重算财务链路

- 类型：逻辑 bug / 写路径
- 证据：
  - `cloudfunctions/admin-api/src/app.js:8324-8338`
- 现象：
  - 该接口只直接写 `pay_amount` 和 `actual_price`
  - 没有看到佣金、退款基数、分账、结算、后续审计口径的联动修正
- 影响面：
  - “改钱”动作可能把订单金额与后续账务口径拆开
  - 对账、追责、退款计算都可能出现前后不一致
- 为什么现在就该排到前面：
  - 这是高风险资金路径
  - 比结构债务更危险，因为一旦线上使用会产生真实账务后果

#### P1. 高风险写路径仍在大量使用整集合写回

- 类型：写路径
- 证据：
  - `cloudfunctions/admin-api/src/app.js:1943-1949`：`patchCollectionRow()`
  - `cloudfunctions/admin-api/src/store/providers/cloudbase.js:507-518`：`saveCollection()`
  - `cloud-mp/README.md:46-49` 已明确承认 `saveCollection()` 仍有整集合写回风险
- 现象：
  - `patchCollectionRow()` 先在内存数组中替换，再调用 `saveCollection()`
  - `saveCollection()` 仍以集合级刷新方式落到 CloudBase provider
- 影响面：
  - 在 `users`、`orders`、`refunds`、`commissions` 等高频集合上，容易出现并发覆盖、半成功、跨集合不一致
- 为什么现在就该排到前面：
  - 这是系统性风险，不是单点 bug
  - 如果不先收口写路径，后续再多测试也只能覆盖表象

#### P1. `admin-api` 入口仍是上帝模块

- 类型：结构债务
- 证据：
  - `cloudfunctions/admin-api/src/app.js` 当前约 `8560` 行
  - 虽已拆出 `admin-system.js`、`admin-finance.js`、`admin-refunds.js`，主入口仍同时承载权限模型、登录、用户、订单、佣金、统计与运行态探针
- 影响面：
  - 任意改动都可能跨域回归
  - 权限问题、写路径问题、运行时问题更容易藏在同一文件不同区域
- 为什么现在就该排到前面：
  - 这已经进入“审计难以覆盖”的规模
  - 它本身不是 bug，但它是高风险 bug 的放大器

#### P1. 当前测试通过不能证明权限可信

- 类型：工程可信度 / 测试
- 证据：
  - `cloudfunctions/admin-api/test/goods-fund-transfer-route.test.js:23-29`
  - `cloudfunctions/admin-api/test/validation-contract.test.js:144-160`
- 现象：
  - 多条路由测试把 `auth` 和 `requirePermission` stub 成永远放行
  - 它们主要验证业务 happy path 或参数校验，不验证真实权限保护
- 影响面：
  - `node --test` 全绿会制造错误安全感
  - 很容易把“路由逻辑通过”误读成“权限基线可信”
- 为什么现在就该排到前面：
  - 项目当前正处于“恢复可信度”阶段
  - 在这种阶段，错误的测试信心和没有测试一样危险

### 3.3 Admin UI

#### P1. Admin UI 权限首轮漂移已收口，但权限真相仍不是单一来源

- 类型：权限 / 契约漂移
- 证据：
  - `admin-ui/src/router/index.js:189-212`：路由层仍承担权限声明
  - `admin-ui/src/config/adminNavigation.js`：导航层继续维护一份权限口径
  - `admin-ui/src/views/dashboard/index.vue`、`orders/index.vue`、`home-sections/index.vue`：页面层还需要自己做高权限请求闸门
  - `cloudfunctions/admin-api/src/app.js` 与 `src/admin-system.js`：后端接口权限已经补齐，但没有统一契约导出
- 现象：
  - 群发消息、会员策略、高权限配置读取这批首轮漂移已经修过
  - 但权限真相仍同时分布在路由、导航、页面闸门和后端接口里
- 影响面：
  - 当前最明显的 403 漂移点已经下降
  - 但只要新增页面或再迁一次接口，前后端权限仍可能重新漂移
- 为什么现在就该排到前面：
  - 这已经证明 Admin UI 的权限真相并不集中
  - 如果不继续朝单一契约推进，后续只会反复修同类问题

#### P2. 订单页已经进入高耦合重页区

- 类型：结构债务
- 证据：
  - `admin-ui/src/views/orders/index.vue` 当前共 `1522` 行
- 现象：
  - 单文件同时承载列表筛选、导出、物流配置、物流轨迹、详情抽屉、发货、改价、备注、强制完成/取消等能力
- 影响面：
  - 订单页是高频核心页面，任何新增需求都会继续堆叠权限分支、状态分支和接口依赖
- 为什么现在就该排到前面：
  - 它不一定是当前最高风险 bug 源，但已经是未来回归风险的聚集区

#### P1. 管理端工程可信度基线还不够

- 类型：工程可信度
- 证据：
  - `admin-ui/package.json` 目前已补 `check`，但仍缺 `lint`、`test`、`typecheck`
  - `admin-ui/src/utils/request.js:143-148` 在 401 处理里对 store 做动态导入
  - 2026-04-20 本地 `vite build` 已对该动态导入发出 chunk 组织警告
  - 2026-04-20 本地 `npm run check` 与 `vite build` 都通过，但检查覆盖面仍然偏窄
- 影响面：
  - 当前“构建通过”不等于静态检查通过
  - 没有 lint/test/typecheck 时，权限契约和 API 调用回归只能靠人工发现
- 为什么现在就该排到前面：
  - 收口阶段的第一要求应该是“构建和检查都可信”
  - 如果继续只有 `build`，后续修复质量会非常依赖人工经验

### 3.4 Miniprogram

#### P1. 订单详情页运行时硬故障已修复，但交易核心页仍缺自动回归保护

- 类型：逻辑 bug / 工程可信度
- 证据：
  - `miniprogram/pages/order/orderDetailData.js:3`
  - `miniprogram/pages/order/orderDetailData.js:82-93`
- 现象：
  - 本轮已补上 `resolveCloudImageUrl` 引入，订单详情页不再因图片归一化直接报错
  - 但这类问题直到人工点检才暴露，说明交易核心页仍缺少最基本的模块级回归保护
- 影响面：
  - 当前故障已消除，但同类引用错误仍可能在其他核心页复现
- 为什么现在就该排到前面：
  - 这类问题已经证明小程序交易页缺少最基础的自动保护
  - 收口阶段不能只修症状，还要明确“为什么它之前没人拦住”

#### P1. 积分抵扣 `70%` 硬钳制已修复，但交易规则仍缺自动化保护

- 类型：逻辑 bug / 交易规则 / 工程可信度
- 证据：
  - `miniprogram/pages/order/orderConfirmPricing.js:15-24`
- 现象：
  - 本轮已去掉前端把 `maxRatio` 强抬到至少 `70%` 的逻辑
  - 但这类金额规则错误此前没有被页面级或规则级测试拦下
- 影响面：
  - 当前金额错误已修复，但交易金额规则仍缺少持续性保护
- 为什么现在就该排到前面：
  - 这已经证明金额规则并没有被自动化约束锁住
  - 只修一处实现而不补保护，后续仍可能回流

#### P1. 登录态主真相已基本收口到 `openid + userInfo`，但仍需要最后一轮残余扫描

- 类型：真相源 / 状态管理
- 证据：
  - `miniprogram/app.js:23` 明确写明 `token` 废弃
  - `miniprogram/appAuth.js`、`store/index.js`、`utils/auth.js`、`utils/errorHandler.js`、`utils/helpers.js`、`utils/requestAuth.js` 已完成本轮主真相收口
  - 这条线仍需要最后一轮调用面残余扫描，确认没有遗漏的旧 `token` 语义
- 影响面：
  - 旧双模型的主冲突已经明显下降
  - 但如果调用面还有残余旧语义，登录恢复和异常处理仍可能出现偶发分叉
- 为什么现在就该排到前面：
  - 登录态属于全局底层约定，必须做完最后一轮扫尾才能真正算收口
  - 这是“已经收大半，但不能留尾巴”的问题

#### P2. transport 层和导航层已经过重，且分散在多个基础设施文件

- 类型：结构债务 / 工程可信度
- 证据：
  - `miniprogram/utils/request.js:20-67`
  - `miniprogram/utils/cloud.js:104-181`
  - `miniprogram/utils/requestCache.js:136-194`
  - `miniprogram/app.json:2-200`
  - `miniprogram/pages/product/detail.js` 当前共 `1057` 行
  - `miniprogram/pages/user/userDashboard.js` 当前共 `734` 行
  - `miniprogram/pages/category/category.js` 当前共 `683` 行
  - `miniprogram/pages/address/regions.js` 当前共 `4194` 行
- 现象：
  - `request` / `cloud` / `requestCache` 一起承担了 REST 映射、云函数调度、重试、去重、Toast/Loading、上传目录策略、缓存定时清理
  - 路由字符串和导航逻辑仍散落在重页与工具层
- 影响面：
  - 任何网络层改动都可能同时碰 transport、UI 和业务约定
  - 未来最容易出现“路径改了但调用点没改完”的漂移
- 为什么现在就该排到前面：
  - 这是当前没有完全爆炸、但最容易继续恶化的治理缺口

## 4. `P0/P1/P2` 问题表

| 优先级 | 问题 | 类型 | 关键证据 | 影响面 |
| --- | --- | --- | --- | --- |
| `P0` | 上层旧上下文仍在误导 `cloud-mp` 主线判断 | 真相源 | `zz/README.md:3-7`, `zz/docs/rules/project-collaboration-rules.md:13-27`, `cloud-mp/README.md:3-4` | 所有后续审计与协作 |
| `P0` | 根目录解释权竞争，主入口仍被工具目录和迁移资料挤占 | 工程可信度 | `DOCUMENTS.md`, `PROJECT_OVERVIEW.md`, `.agents/`, `.claude/`, `skills/`, `CLOUDBASE_TARGET_MODEL.md` | 新人、AI、排障入口 |
| `P1` | `docs/` 顶层未完成长期规则与快照分层 | 文档真相 | `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`, `docs/AUDIT_ALL_SUMMARY.md`, `docs/P1_FIXES_SUMMARY.md` | 文档可信度 |
| `P1` | 项目外显名称多点漂移 | 品牌叙事 | `admin-ui/index.html:7-8`, `layout/index.vue:20`, `miniprogram/app.js:31`, `app.json:168-189` | 内外部身份稳定性 |
| `P1` | 后台权限首轮已修，但权限真相仍靠散点路由与局部测试维持 | 权限 / 工程可信度 | `app.js:4744`, `7986`, `admin-system.js:111-318`, `validation-contract.test.js:553-591` | 配置、监控、经营数据 |
| `P1` | 改价写路径缺少财务联动 | 逻辑 bug / 写路径 | `app.js:8324-8338` | 订单金额、退款、结算 |
| `P1` | 高风险集合仍整集合写回 | 写路径 | `app.js:1943-1949`, `store/providers/cloudbase.js:507-518` | `users/orders/refunds/commissions` |
| `P1` | 测试通过不能证明权限可信 | 工程可信度 / 测试 | `goods-fund-transfer-route.test.js:23-29` | 质量判断基线 |
| `P1` | Admin UI 权限真相仍不是单一来源 | 权限 / 契约漂移 | `router/index.js:189-212`, `adminNavigation.js`, `dashboard/index.vue`, `orders/index.vue` | 菜单、页面、接口一致性 |
| `P1` | 管理端已补 `check`，但仍缺 lint/test/typecheck | 工程可信度 | `admin-ui/package.json`, `scripts/check-privileged-config-usage.mjs` | 构建可信度 |
| `P1` | 小程序交易硬故障已修，但核心页仍缺自动回归保护 | 逻辑 bug / 工程可信度 | `orderDetailData.js:3`, `82-93` | 核心交易详情页 |
| `P1` | 交易金额规则错误已修，但仍缺规则级自动化保护 | 逻辑 bug / 交易规则 / 工程可信度 | `orderConfirmPricing.js:15-24` | 实付金额与积分消耗 |
| `P1` | 小程序登录态主真相已收口，但仍需最后一轮残余扫描 | 真相源 / 状态管理 | `app.js:23`, `appAuth.js`, `store/index.js`, `utils/requestAuth.js` | 登录恢复、异常处理、外链 |
| `P2` | 订单页、小程序核心页已进入重页区 | 结构债务 | `orders/index.vue` `1522` 行，`product/detail.js` `1057` 行 | 后续回归与维护成本 |
| `P2` | transport 与导航层职责过重且分散 | 结构债务 | `utils/request.js`, `utils/cloud.js`, `utils/requestCache.js`, `app.json` | 网络层治理 |

## 5. 为什么现有检查没有拦住这些问题

### 5.1 `check:foundation` 只证明结构存在，不证明规则正确

- 本轮 `npm run check:foundation` 通过，说明项目结构、环境配置、关键云函数入口存在
- 但这类检查不会验证：
  - 上下层真相源是否一致
  - 后台接口是否做了权限校验
  - 改价、退款、佣金等高风险写路径是否一致

### 5.2 `node --test` 当前更接近“路由功能冒烟”，不是“权限可信性证明”

- 本轮 `node --test "cloudfunctions/admin-api/test/*.test.js"` 通过
- 但测试里存在大量 `auth` / `requirePermission` 永远放行的 stub
- 结论：
  - 它可以证明部分业务路径可执行
  - 不能证明真实 app 下的权限边界没有回退

### 5.3 `audit:miniprogram-routes` 只证明映射表存在，不证明调用层和页面层健康

- 本轮 `npm run audit:miniprogram-routes` 通过
- 但它验证的是 `requestRoutes.js` 这张映射表，不会发现：
  - 交易金额规则错误
  - 登录状态真相分裂
  - 页面级运行时异常

### 5.4 `admin-ui build` 只证明能打包，不证明契约一致

- 本轮 `cd admin-ui && npm run build` 通过
- 但构建已提示 `request.js` 中动态导入 `store/user.js` 的 chunk 组织警告
- 同时 `admin-ui` 没有 lint/test/typecheck 脚本
- 结论：
  - 构建通过只说明页面能被打包
  - 不说明权限、接口、路由、数据契约是正确的

### 5.5 当前工程缺少“规则级”自动守卫

当前仓库已有不少命令和审计脚本，但仍缺少以下守卫：

- 权限路由与后端接口的自动对比
- 高风险写路径是否使用精确 patch 的自动检查
- 小程序登录状态单一真相源检查
- 根目录污染物与构建产物跟踪边界检查

## 6. 第一批整改优先级建议

本报告不展开修复细节，只给第一批优先级。

### 第一优先：先统一真相源

1. 决定 `zz/` 与 `cloud-mp/` 哪个目录是当前主工程真相源。
2. 把另一条线明确降级为“现网旧主线”或“迁移目标”，不要继续双向自称主线。
3. 把 `cloud-mp/` 根目录主入口压缩到少数几份文件，清走同层阶段总结与临时产物。

### 第二优先：先封住权限真相漂移

1. 后端敏感接口补齐权限校验，不能继续只依赖 `auth`。
2. 前端路由权限、菜单权限、后端接口权限必须收口到同一份权限目录。
3. 在测试中增加真实 `requirePermission` 行为验证，避免继续用全放行 stub 冒充可信测试。

### 第三优先：先封住高风险写路径

1. 改价、退款、货款、佣金相关写路径先做专项盘点。
2. 整集合写回在高风险集合上必须优先收口。
3. 在写路径规则没统一前，不建议继续扩展同域新功能。

### 第四优先：先修会直接伤到交易链路的小程序问题

1. 修订单详情运行时异常。
2. 修积分抵扣比例错误。
3. 把登录状态真相源收口到单一模型，再处理页面级兼容。

### 第五优先：建立更可信的工程基线

1. `admin-ui` 补 lint/test/typecheck 或等价守卫。
2. 清理仓库内已跟踪的构建产物与临时产物。
3. 把“构建通过”和“规则正确”区分成两套不同的基线结论。

## 7. 说明与假设

- 本轮审计默认以 `cloud-mp/` 为主对象；上层 `zz/` 仅用于证明真相源冲突，不展开全仓修复计划。
- 本文优先做诊断，不进入修复方案设计。
- 所有历史报告、运行快照、阶段总结默认是辅助资料；只有 2026-04-20 被重新验证过的内容，才视为当前可信基线。
