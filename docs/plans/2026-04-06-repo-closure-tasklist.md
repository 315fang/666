# 仓库收口任务清单

日期：2026-04-06
负责人：Codex
状态：第一阶段完成，风险项已决策

## 1. 使用说明

本清单是当前仓库收口的唯一任务列表。

- `[x]` 已完成
`[-]` 表示进行中
- `[ ]` 未开始
- `[!]` 风险项 / 需要决策

## 2. 已完成

### 2.1 文档与入口

- `[x]` 重写根目录 `README.md`，修正项目真实技术栈与入口
- `[x]` 替换无关的 `CLAUDE.md`
- `[x]` 建立 `docs/README.md`
- `[x]` 建立 `docs/archive/README.md`
- `[x]` 建立正式审计报告 `docs/audit/2026-04-06-repo-audit.md`
- `[x]` 建立收口总方案 `docs/plans/2026-04-06-repo-closure-program.md`
- `[x]` 建立权限说明 `docs/guides/permissions.md`
- `[x]` 建立测试说明 `docs/guides/testing.md`

### 2.2 文档归档

- `[x]` 归档 `docs/changelog/`
- `[x]` 归档 `docs/internals/`
- `[x]` 归档 `docs/design/`
- `[x]` 归档旧计划与历史快照
- `[x]` 从主入口移除明显失真的历史说明

### 2.3 工程可信度

- `[x]` 统一后端测试到 Jest 可执行语义
- `[x]` 修复 `backend npm test` 不可信问题
- `[x]` 修复 `OrderNumberService` 批量生成单号偶发重复问题
- `[x]` 确认 `backend npm test` 当前通过：`9 suites passed / 88 tests passed`
- `[x]` 确认 `admin-ui npm run build` 当前可通过
- `[x]` 为 `orderController` 补充控制层 Jest 测试，覆盖 XML / JSON / 错误分支
- `[x]` 为 `adminAuth.checkPermission` 补充权限归一化与拒绝路径测试
- `[x]` 修复 `CacheService` 定时器导致的 Jest open handle 问题

### 2.4 权限收口

- `[x]` 修复管理端 `Admins` 路由权限从 `super_admin` 到 `admins` 的漂移
- `[x]` 建立前端共享角色预设 `admin-ui/src/config/adminRolePresets.js`
- `[x]` 移除 `admin-ui/src/store/user.js` 和 `admin-ui/src/views/admins/index.vue` 的重复角色权限表
- `[x]` 收口 `settlements -> commissions`
- `[x]` 收口 `settings -> settings_manage`
- `[x]` 保留后端权限兼容归一化，避免旧数据立刻炸裂

### 2.5 后端结构收口

- `[x]` 将 `backend/routes/admin/index.js` 从上帝路由切为聚合入口
- `[x]` 新增 `backend/routes/admin/content.js`
- `[x]` 新增 `backend/routes/admin/system.js`
- `[x]` 新增 `backend/routes/admin/finance.js`
- `[x]` 新增 `backend/routes/admin/organization.js`
- `[x]` 将 `backend/server.js` 收口为启动编排入口
- `[x]` 新增 `backend/services/StartupService.js`，集中启动检查、建表预热与定时任务注册
- `[x]` 新增 `backend/services/OrderQueryService.js`，下沉订单查询与详情聚合逻辑
- `[x]` 新增 `backend/services/OrderReviewService.js`，下沉订单评价与积分奖励逻辑

### 2.6 管理端结构收口

- `[x]` 分阶段拆分 `admin-ui/src/views/activities/index.vue`
- `[x]` 抽出 `SlashActivityDialog`、`LotteryPrizeDialog`、`SlashActivityPanel`、`LotteryPrizePanel`
- `[x]` 抽出 `FestivalConfigPanel`、`ActivityLinksPanel`，将活动页主文件降到可维护范围
- `[x]` 拆出 `settings` 页的基础信息、运营参数、账号管理、服务承诺、轻提示弹窗子组件
- `[x]` 拆出 `users` 页的团队概况弹窗、搜索区、主表格卡片子组件

## 3. 进行中

### 3.1 后端控制层收口

- `[x]` 清理 `backend/controllers/orderController.js` 的历史残留导入与误导性注释
- `[x]` 继续压缩 controller，只保留 request/response 逻辑
- `[x]` 识别仍留在 controller 的业务逻辑并下沉到 service

### 3.2 收口总文档维护

- `[x]` 保持审计报告、总方案、任务清单三者同步
- `[x]` 防止“代码改了，文档还是旧的”再次发生

### 3.3 小程序用户页收口

- `[x]` 分阶段拆分 `miniprogram/pages/user/user.js`
- `[x]` 抽离用户页 dashboard 数据编排与缓存逻辑
- `[x]` 拆出 `category` 页的分类商品加载与购物袋 helper
- `[x]` 拆出 `category` 页的价格预览 helper
- `[x]` 拆出 `order/confirm` 页的地址自提与价格优惠 helper
- `[x]` 拆出 `order/confirm` 页的提交流程与账户状态 helper
- `[x]` 拆出 `app.js` 的登录、品牌配置与首页预拉取 helper
- `[x]` 拆出 `index` 页的首页配置、精选商品、海报与气泡轮播 helper
- `[x]` 拆出 `product/detail` 页的商品装配与收藏 helper
- `[x]` 拆出 `product/detail` 页的规格与购买动作 helper
- `[x]` 拆出 `order/detail` 页的订单加载与支付轮询 helper
- `[x]` 拆出 `order/detail` 页的收货、取消、物流与退款动作 helper
- `[x]` 拆出 `activity` 页的配置加载与倒计时 helper
- `[x]` 拆出 `settings` 页的小程序配置面板组件
- `[x]` 拆出 `stations/map` 页的加载与地图交互 helper
- `[x]` 拆出 `agent-wallet` 页的流水与充值配置 helper
- `[x]` 拆出 `utils/request.js` 的登录过期与上传 helper

### 3.4 管理端大页持续收口

- `[x]` 继续拆 `admin-ui/src/views/settings/index.vue`，收口小程序配置剩余大区块
- `[x]` 继续拆 `admin-ui/src/views/users/index.vue`，收口主表格与详情抽屉

## 4. 未开始

### 4.1 仓库卫生

- `[x]` 移除已被 Git 跟踪的压缩包：`backend/新建文件夹.rar`
- `[x]` 移除已被 Git 跟踪的数据库快照：`backend/说明/s2b2c_db_20260208130840cz3dc.sql`
- `[x]` 清空 `backend/logs/` 运行日志文件
- `[x]` 收紧根 `.gitignore`，忽略本地工具目录、技能日志与临时文件
- `[x]` 重新核对 `backend/.gitignore` 是否覆盖真实污染物
- `[x]` 给“保留历史资料”和“主仓库日常开发资料”建立明确边界

### 4.2 后端结构收口

- `[x]` 拆 `backend/server.js`，把启动、初始化、检查、任务注册解耦
- `[x]` 继续拆 `backend/controllers/orderController.js`
- `[x]` 继续拆 `backend/services/OrderCoreService.js`
- `[x]` 清理 `OrderCreationService`、`OrderPaymentService`、`OrderFulfillmentService` 的职责边界
- `[x]` 清理 controller / service 中无用依赖、注释噪音、历史兼容残留
- `[x]` 评估 `backend/routes/admin/debug.js`、`env-check.js`、`mass-message.js` 是否继续保留在主入口层

### 4.3 测试体系

- `[x]` 给权限归一化逻辑补单测
- `[x]` 给 `admin` 路由关键权限路径补单测
- `[x]` 给订单主链路补单测：下单、预支付、取消、确认收货
- `[x]` 给支付回调与售后关键逻辑补单测
- `[x]` 给金额与佣金链路补单测
- `[x]` 建立 `backend` 测试分层说明：controller / service / utils
- `[x]` 确定后续新增测试全部使用 Jest，不再接受混用

### 4.4 权限模型

- `[x]` 扫描管理端全部路由 `meta.permission`，确认没有剩余别名或脏值
- `[x]` 扫描后端全部 `checkPermission(...)`，确认全部使用正式权限键
- `[x]` 输出一份“正式权限键清单”
- `[x]` 评估是否将权限键导出为前后端共享常量
- `[x]` 决定何时移除后端 alias 兼容层

### 4.5 管理端结构收口

- `[x]` 拆 `admin-ui/src/views/activities/index.vue`
- `[x]` 拆 `admin-ui/src/views/settings/index.vue`
- `[x]` 拆 `admin-ui/src/views/users/index.vue`
- `[x]` 清理管理端重复 API 调用和本地状态逻辑
- `[x]` 推进 `src/api/modules/` 取代散落 API 封装
- `[x]` 扫描构建大包来源，先定位 `element-plus` 和超大页面 chunk
- `[x]` 判断是否需要按页面 / 组件做懒加载与依赖切分

### 4.6 小程序结构收口

- `[x]` 拆 `miniprogram/pages/user/user.js`
- `[x]` 拆 `miniprogram/app.js`
- `[x]` 拆 `miniprogram/pages/category/category.js`
- `[x]` 拆 `miniprogram/pages/order/confirm.js`
- `[x]` 拆 `miniprogram/pages/index/index.js`
- `[x]` 拆 `miniprogram/pages/product/detail.js`
- `[x]` 拆 `miniprogram/pages/order/detail.js`
- `[x]` 拆 `miniprogram/pages/activity/activity.js`
- `[x]` 拆 `miniprogram/pages/stations/map.js`
- `[x]` 拆 `miniprogram/pages/wallet/agent-wallet.js`
- `[x]` 收口 `miniprogram/utils/request.js` 的过载职责
- `[x]` 给小程序建立页面 / utils / domain 的分层约定

### 4.7 文档重建

- `[x]` 建立 `docs/architecture/overview.md`
- `[x]` 建立 `docs/architecture/backend.md`
- `[x]` 建立 `docs/architecture/admin-ui.md`
- `[x]` 建立 `docs/architecture/miniprogram.md`
- `[x]` 建立 `docs/guides/local-development.md`
- `[x]` 建立 `docs/guides/deployment.md`
- `[x]` 重写仍然需要保留的业务规则文档
- `[x]` 给后端启动 / 构建 / 测试 / 发布流程形成统一入口

## 5. 风险项

- `[x]` 当前工作区非常脏，存在大量历史或并行改动，本轮收口不能假设工作树干净
  - 结论：后续继续按“默认工作树不干净”执行，不做基于干净工作树的危险假设。
- `[x]` 仓库内存在多个 `.agent/.opencode/.worktrees/skill` 相关目录，后续需要决定哪些属于项目资产，哪些属于工具残留
  - 结论：这些目录不属于项目资产，已从主仓库工作区移除，并由 `.gitignore` 持续忽略。
- `[x]` 项目内“规范文档 / skill / 真实代码”并不完全一致，后续必须统一唯一真相源
  - 结论：运行行为以代码为准，项目说明以 `docs/` 为准；若冲突，以较新且已验证的一方为准，并在同轮同步另一侧。
- `[x]` `admin-ui` 构建告警已消除，但页面与状态逻辑仍有继续收口空间，不能把“无大包警告”等同于“前端已完全健康”
  - 结论：当前前端收口先停在“恢复可维护开发”的程度，进一步健康化进入第二阶段，不继续在第一阶段无限打磨。

## 6. 决策记录

1. `.agent/`、`.opencode/`、`.worktrees/`、`skill/` 不属于项目资产，可直接删除。
2. 代码与文档冲突时，以当前较新的、已验证的一方为准，并同步更新另一侧。
3. 后端权限 alias 兼容层只保留一个过渡窗口；待旧数据清理后移除。
4. 主仓库只保留源码、配置、当前文档；日志、压缩包、SQL 快照、上传产物和工具缓存不进入主仓库。
5. 第一阶段收口到此为止；前端进一步健康化进入第二阶段。

## 7. 建议执行顺序

1. 收口 `backend/controllers/orderController.js`
2. 补权限与订单主链路测试
3. 清理仓库污染物与 `.gitignore`
4. 拆管理端 `activities/index.vue`
5. 拆小程序 `pages/user/user.js`
6. 重建架构文档与部署文档

## 8. 验收标准

达到以下条件，才算第一阶段收口完成：

1. 文档入口可信，错误旧文档不再挂在主路径
2. `backend npm test` 稳定通过，且覆盖关键链路
3. 权限键只有一套正式命名
4. `backend/routes/admin/index.js`、`orderController.js`、管理端活动页、小程序用户页不再是超大上帝文件
5. 仓库中不再跟踪压缩包、日志、数据库快照等污染物
