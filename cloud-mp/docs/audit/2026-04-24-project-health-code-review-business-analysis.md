# 项目体检、代码审查与业务分析

日期：2026-04-24
范围：Git 根目录 `zz/` 的当前工作树，重点审查 `cloud-mp/` CloudBase 主线；上层旧 `backend/admin-ui/miniprogram` 作为边界与历史主线对照。

## 1. 总结判断

当前项目已经具备可运行的 CloudBase 主线：小程序、管理后台、云函数、运营数据和核心业务链路都存在，不属于“需要推倒重来”的状态。

但它还不能被判断为生产可信。主要原因不是功能缺失，而是四类可信度问题仍然存在：

1. 真相源仍冲突：Git 根目录仍把 `backend/admin-ui/miniprogram` 描述成主系统，而当前活跃实现集中在 `cloud-mp/`；`cloud-mp/README.md` 当前不存在，但多份文档仍把它作为入口引用。
2. 运行证据不一致：`FINANCE_SMOKE_AUDIT` 能读到 `users/refunds/withdrawals`，但 `runtime:status` 仍把这些 required collections 标为 missing。
3. 支付与退款核对未闭环：正式微信支付 readiness 失败，缺少 `PAYMENT_WECHAT_APPID`、`PAYMENT_WECHAT_MCHID`、`PAYMENT_WECHAT_NOTIFY_URL`、`PAYMENT_WECHAT_SERIAL_NO`、`PAYMENT_WECHAT_API_V3_KEY`。
4. 依赖安全风险未收口：多个生产依赖存在 high/critical advisories，集中在 CloudBase SDK / COS SDK / request 链、旧后端 `sequelize`、`multer` 等。

优先级判断：先修可信度与资金链风险，再继续扩功能。

## 2. 本轮验证结果

已通过：

- `cloud-mp npm run check:foundation`：31/31 通过
- `cloud-mp npm run audit:miniprogram-routes`：12/12 通过
- `cloud-mp node --test "cloudfunctions/admin-api/test/*.test.js"`：49/49 通过
- `cloud-mp node --test "cloudfunctions/payment/test/*.test.js"`：2/2 通过
- `cloud-mp/admin-ui npm run check`：通过
- `cloud-mp/admin-ui npm run build`：通过
- `cloud-mp npm run audit:finance-smoke`：通过，读到 `refunds=33`、`withdrawals=6`、`commissions=10`、`users=211`
- `zz/backend npm test`：21 suites / 137 tests 通过

未通过或有警告：

- `cloud-mp npm run audit:business`：失败，`admin/activity-links` 为 `HTTP 200 / code unknown`
- `cloud-mp npm run payment:ready`：失败，正式微信支付关键配置缺失
- `cloud-mp npm run runtime:status`：失败，报告 `users/skus/categories/refunds/reviews/withdrawals` missing 或低于基线
- `cloud-mp/admin-ui npm run build`：有 Vite 警告，`src/store/user.js` 被动态导入同时又被多处静态导入
- `npm audit --omit=dev --registry=https://registry.npmjs.org`：多处生产依赖存在 high/critical advisories

## 3. 代码审查发现

### P1. 运行状态脚本误判 live 集合缺失

证据：

- `scripts/check-cloudbase-runtime-status.js:232-241`
- `docs/CLOUDBASE_ENV_RUNTIME_STATUS.md`
- `docs/FINANCE_SMOKE_AUDIT.md`

`runtime:status` 先用 `readNoSqlDatabaseStructure listCollections` 构建集合存在性，再只对已列出的集合读取 total。当前它报告 `users/refunds/withdrawals` missing；但 `audit:finance-smoke` 直接读取同名集合成功，并得到非零数量。

影响：

- 发布门禁会被错误阻断。
- 团队会误判 CloudBase 环境缺表。
- 运行证据之间互相冲突，降低审计可信度。

建议：

- `runtime:status` 不应只信 `listCollections`。
- 对 required collections 应逐个 `readNoSqlDatabaseContent` 探测；读取成功即视为存在。
- 把 “listCollections 未列出但 direct read 成功” 标为 `structure_list_inconsistent`，不要标 missing。

### P1. `activity-links` 响应过大，导致 smoke 无法解析

证据：

- `scripts/audit-business-smoke.js:111-140`
- `cloudfunctions/admin-api/src/admin-marketing.js:1944-1947`

`GET /admin/api/activity-links` 返回完整 `brand_news.content_html`，其中包含大段 HTML 和带签名图片 URL。Cloud Function invoke 的 `RetMsg` 体积过大时，smoke 解析会落到 `code unknown`，本轮业务 smoke 因此失败。

影响：

- 业务 smoke 无法稳定证明后台活动入口可用。
- 管理端列表接口混入详情富文本，增加网络体积和截断风险。
- 带签名 URL 的大 HTML 继续进入审计产物，增加过期链接与信息污染。

建议：

- `GET /activity-links` 只返回入口卡片与新闻摘要。
- 新闻正文改成 detail 接口按需读取。
- smoke 校验列表接口时不要依赖完整富文本。

### P1. 财务统计日期参数缺少非法值保护

证据：

- `cloudfunctions/admin-api/src/admin-finance.js:46-48`
- `cloudfunctions/admin-api/src/admin-finance.js:298-303`

`agent-performance` 直接对 `req.query.date` 调 `new Date()`，随后把 `refDate.getTime()` 传给 `Intl.DateTimeFormat.formatToParts()`。当传入非法日期时，`new Date(NaN)` 会触发 `RangeError`，接口会从参数错误变成 500。

影响：

- 后台财务页或外部调用只要传入异常日期，就可能打出服务端错误。
- 当前测试没有覆盖该路径。

建议：

- 先用 `parseDateTimestamp` 校验 query date。
- 非法值返回 400，或回退到当前日期。
- 增加 `agent-performance?date=bad` 的回归测试。

### P1. 隐藏账户过滤可被孤儿资金记录绕过

证据：

- `cloudfunctions/admin-api/src/admin-finance.js:88-90`

`isVisibleUserLinkedRow()` 找不到 owner 时直接返回 `true`。如果资金流水、佣金或提现记录里的 `openid` 已失效，或者 `openid` 错误但 `user_id` 指向隐藏账户，这类记录仍会进入财务统计。

影响：

- 已隐藏的测试账户或清理账户仍可能污染财务看板。
- “从 2026-04-24 起可信统计”的口径会被孤儿记录破坏。

建议：

- 对带用户引用的资金记录，找不到 owner 应默认排除或进入异常桶。
- 对 `openid/user_id/buyer_id/member_openid` 应逐个尝试匹配，而不是用第一个 truthy 值短路。
- 输出 `orphan_finance_rows_count`，供运营清理。

### P2. 小程序时间解析把非法时间变成 1970 时间

证据：

- `miniprogram/pages/activity/activityTimers.js:5-13`
- `miniprogram/pages/activity/activityTimers.js:71-73`
- `miniprogram/pages/activity/limited-spot.js:9-18`

`parseChinaTime()` 对空值或非法值返回 `0`，而调用处使用 `Number.isFinite()` 判断合法性。`0` 会被当成有效时间戳，导致无效开始时间被视为 1970 年，倒计时可能错误进入“进行中”或触发过期刷新。

影响：

- 活动配置异常时，小程序不会明确暴露“档期无效”，而是展示错误状态。
- 该问题影响限时活动入口和活动页 section countdown。

建议：

- 非法时间返回 `NaN`，调用处用 `Number.isFinite()` 过滤。
- 对无效时间显示“档期配置异常”或隐藏倒计时。
- 抽出统一时间工具，避免管理端、云函数、小程序各写一套解析。

### P2. 营销模块存在重复的限时档期 helper

证据：

- `cloudfunctions/admin-api/src/admin-marketing.js:1063-1234`
- `cloudfunctions/admin-api/src/admin-marketing.js:1494-1666`

同一模块内重复定义 `parseDateTimestamp`、`sortLimitedSaleSlots`、`normalizeLimitedSaleSlotPayload`、`validateLimitedSaleSlot`、`normalizeLimitedSaleItemPayload` 等函数。当前实现大体一致，但重复定义会让后续修复只改一处，形成隐性漂移。

建议：

- 合并为单一 helper 区。
- 限时活动时间解析统一复用一个函数。
- 给 `YYYY-MM-DD`、无时区 datetime、有 offset datetime、非法 datetime 增加测试。

## 4. 工程健康分析

### 仓库边界

当前 Git 根目录仍有两条主线：

- 旧主线：`backend/`、根层 `admin-ui/`、根层 `miniprogram/`
- 当前 CloudBase 主线：`cloud-mp/`

`cloud-mp/` 下又包含 `admin-ui/`、`miniprogram/`、`cloudfunctions/`、`docs/`、`mysql/`、`cloudbase-seed/`、`cloudbase-import/`。这说明仓库从 MySQL/Express 主线迁移到 CloudBase 主线后，边界仍未彻底收口。

风险：

- 新人和 AI 很容易改错目录。
- 上层 AGENTS/README 与 `cloud-mp` 文档互相竞争解释权。
- CI、审计脚本、部署脚本需要明确只针对哪条主线。

### 仓库污染

仍被 Git 跟踪的高风险或低价值产物包括：

- `cloud-mp/admin-ui/dist-admin-upload.zip`
- `cloud-mp/mysql/s2b2c_db_20260407192328p0a90.sql`
- `cloud-mp/mysql/jsonl/*.json`
- `cloud-mp/cloudbase-import/*.jsonl`
- `.omx/logs/*.jsonl`
- 多个 `.runtime/overrides/*.json`

说明：

- `cloudbase-import` 和 seed 可能仍有迁移价值，但应明确“源数据资产”与“一次性导入产物”的边界。
- `.runtime/overrides` 作为本地运行覆盖数据，应从生产源码边界中剥离或转为明确 fixture。

### 大文件和上帝模块

当前最危险的大文件：

- `cloudfunctions/admin-api/src/app.js`：约 9008 行
- `cloudfunctions/payment/payment-callback.js`：约 2454 行
- `cloudfunctions/admin-api/src/admin-marketing.js`：约 2375 行
- `cloudfunctions/order/order-create.js`：约 1989 行
- `admin-ui/src/views/orders/index.vue`：约 1712 行
- `admin-ui/src/views/home-sections/index.vue`：约 1629 行

判断：

- `admin-api/src/app.js` 已经超出可审计规模。
- `admin-marketing.js` 已开始出现重复 helper，说明拆分还没有形成稳定边界。
- 订单、支付、退款、佣金属于资金链，继续堆在大文件中会放大回归风险。

### 测试可信度

正向：

- 旧后端 Jest 全绿，CloudBase admin-api 和 payment node:test 全绿。
- 小程序路由审计通过。
- Admin UI 至少已有高权限配置 API 静态检查。

不足：

- Admin UI 仍无 lint/test/typecheck。
- 小程序核心交易页缺少模块级自动回归。
- 权限测试仍偏局部点检，没有形成“后端接口权限矩阵 vs 前端路由/导航权限”的自动对比。
- 业务 smoke 会被大响应体和响应形态差异影响，当前不能作为稳定门禁。

### 依赖安全

本轮使用官方 npm registry 复核，结果如下：

- `cloud-mp/`：10 个 prod advisories，其中 4 critical，主要来自 `cos-nodejs-sdk-v5 -> request/fast-xml-parser/form-data`
- `cloud-mp/admin-ui/`：4 个 advisories，包含 `axios`、`lodash/lodash-es`
- `cloud-mp/cloudfunctions/admin-api/`：16 个 advisories，包含 `@cloudbase/node-sdk`、`wx-server-sdk`、`request`、`protobufjs` 等
- `zz/backend/`：19 个 advisories，包含 `cos-nodejs-sdk-v5`、`sequelize`、`multer`、`request` 等

处理建议：

- 不建议直接 `npm audit fix --force`，因为涉及 CloudBase SDK、COS SDK、Express/Multer/Sequelize 等运行关键依赖。
- 先分主线处理：`cloud-mp` 生产依赖优先于旧 `backend`。
- 对 `cos-nodejs-sdk-v5`、`@cloudbase/node-sdk/wx-server-sdk` 做兼容性验证后升级或替代。

## 5. 业务分析

### 当前业务定位

当前系统更接近：

品牌商城交易系统 + 分销代理体系 + 双钱包资金链 + 会员积分成长体系 + 后台运营管理系统。

不是单纯商城，也不是完整企业级财务 ERP。

### 已形成闭环的业务链

1. 商城交易链：商品、分类、购物车、订单确认、订单列表/详情、支付后处理均已存在。
2. 活动成交链：拼团、砍价、限时专享、优惠券、抽奖、品牌内容入口均有实现。
3. 分销佣金链：邀请关系、团队、佣金、提现、佣金转货款、后台审核链路存在。
4. 货款钱包链：代理货款账户、充值、货款流水、货款支付、内部退款链路存在。
5. 会员积分链：积分、成长值、签到/任务、积分抵扣、会员中心展示存在。
6. 后台运营链：经营看板、财务看板、商品、订单、退款、提现、佣金、用户、内容、权限、运维页面存在。

### 仍不完整或不可信的业务点

1. 正式支付配置不完整，微信支付/退款核对不能宣称生产闭环。
2. 退款核对仍依赖人工与配置补齐，微信正式查询不可用。
3. 代理升级和高阶奖励规则仍有近似口径，尤其爆单商品、实物消耗额、B3 动销分层。
4. 企业化能力不足：实名认证、账号注销、对公打款、发票、年终分红未形成完整闭环。
5. 财务看板使用 “trusted since 2026-04-24” 口径是必要止血，但不是历史账务清算。
6. 品牌命名仍漂移：后台仍有 S2B2C 表达，小程序和内容侧已偏向“问兰/臻选”。

### 商业可用性判断

可以用于继续内测和受控试运营：

- 商品浏览
- 活动配置
- 下单链路
- 后台运营
- 用户与分销数据观察

不建议直接开放为强财务生产：

- 正式微信支付配置未齐
- 退款核对不可自动闭环
- 依赖安全风险未评估
- 财务统计口径仍处于收口期

## 6. 下一步优先级

### 第一优先级：恢复真相源

1. 为 `cloud-mp/` 恢复或重建唯一 `README.md`。
2. 修改所有指向缺失 `PROJECT_OVERVIEW.md`、`cloud-mp/README.md` 的文档。
3. 在根 README/AGENTS 中明确：当前开发主线到底是 `cloud-mp/` 还是上层旧主线。

### 第二优先级：修运行证据

1. 修 `runtime:status` 集合探测逻辑。
2. 修 `audit:business` 的 `activity-links` 失败，优先收窄接口响应体。
3. 将 `runtime:status`、`audit:business`、`audit:finance-smoke` 的结论口径对齐。

### 第三优先级：封资金链风险

1. 补齐微信正式支付配置。
2. 重新跑 `payment:ready`、`audit:refunds`、`release:finance`。
3. 清理或解释所有 `unknown` 退款通道和微信查询跳过项。

### 第四优先级：修当前代码风险

1. 修财务日期非法参数 500。
2. 修隐藏账户 / 孤儿资金记录过滤。
3. 修小程序非法时间戳返回 `0` 的倒计时问题。
4. 合并 `admin-marketing.js` 中重复的限时档期 helper。

### 第五优先级：依赖与仓库卫生

1. 对 `cloud-mp` 生产依赖做升级验证计划。
2. 清理或降级已跟踪的 zip、SQL、runtime overrides、日志。
3. 给 Admin UI 补 lint/typecheck/test 中至少一类自动保护。

## 7. 最终结论

当前项目的业务面已经足够宽，主交易与运营链也已经跑通；真正的问题是可信度还没跟上业务复杂度。

短期正确策略不是继续加功能，而是完成三件事：

1. 单一真相源。
2. 资金链和支付退款证据闭环。
3. 工程门禁从“能跑”升级到“能证明没回退”。

这三件事完成后，项目才适合恢复正常业务迭代。
