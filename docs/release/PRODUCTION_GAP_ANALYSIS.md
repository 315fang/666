# 生产差距分析

更新日期：2026-04-08

## 当前判断

项目已经不再是“只能演示”的状态，但还不能称为可直接投产。

当前最接近生产的部分：

- 小程序核心交易链路已基本迁到 CloudBase 方向
- 后台静态前端已上线到 CloudBase 静态托管
- 后台 API 已通过 CloudBase 云函数 `admin-api` 对外提供
- 订单、用户、退款、提现、佣金、素材、Banner、内容、设置等后台核心模块已具备第一阶段接口
- 后台上传链路已改为 CloudBase 云存储优先，本地存储仅作为 fallback

## P0 阻塞项

### 1. 正式支付未接通

当前 [cloud-mp/cloudfunctions/payment/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/payment/index.js) 仍保留模拟支付逻辑。

这意味着：

- 不能进行真实支付下单
- 不能完成正式回调验签
- 不能验证生产幂等
- 不能验证真实退款闭环

这是当前最大生产阻塞项。

### 2. 物流追踪未接通

[cloud-mp/cloudfunctions/order/index.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/order/index.js) 仍存在物流占位逻辑。

这意味着：

- 后台和小程序不能依赖真实轨迹
- 售后、发货、签收环节缺少完整外部核验

### 3. 后台仍有占位接口

[backend/cloudrun-admin-service/src/app.js](/C:/Users/21963/WeChatProjects/zz/backend/cloudrun-admin-service/src/app.js) 中仍有一部分管理端接口返回空列表或占位响应。

当前已明确的典型区域：

- 支付健康检测
- 系统配置历史
- 数据库索引管理
- 部分统计与运维接口

这些不阻塞最小运营闭环，但会阻塞“完整生产后台”。

### 4. 后台部分关键模块仍未完全迁完

2026-04-08 复核结果：

- `GET /admin/api/users?limit=2` 已在线上函数网关验证通过
- `GET /admin/api/dealers?limit=2` 已从 `404` 修复为可返回最小管理结构
- `dealers` 当前仍是基于现有分销用户合成的最小模型，不是独立经销商数据表
- `branch-agents / n-system / admins / ops-monitor` 仍未完成迁移

这说明：

- 后台“用户管理”线上稳定性问题已解除
- 经销商域已进入“可用但未定版”阶段
- 高级后台域仍不足以支撑完整生产后台

### 5. 旧字段兼容仍然偏多

当前字段审计结果见 [cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/CLOUDBASE_LEGACY_COMPAT_AUDIT.md)。

截至 2026-04-08，仍有较多旧字段残留，例如：

- `quantity`
- `user_id`
- `image_url`
- `avatar_url`
- `nickname`
- `pending_ship`

这会持续增加维护成本，也会干扰数据口径。

## P1 收尾项

### 1. 后台图片存储已打通，但仍保留本地兜底

当前后台上传已经改成：

- 优先上传到 CloudBase 云存储
- 失败时回退到本地 `/uploads` 或函数临时目录

2026-04-08 已完成一次真实上传烟测，返回了有效的 `file_id` 和临时访问 URL。

当前剩余工作不是“能不能上传”，而是“正式环境是否还要保留本地 fallback”。当前默认规则已经收紧为：

- `storage-config.mode=managed`
- 新素材必须上传到 CloudBase 云存储
- 云存储不可用时直接失败，不再静默回退本地

仍需确认：

- `file_id` 正确落库
- 能返回临时访问 URL
- Banner / 素材 / 弹窗广告都能读取同一套图片资产
- 是否彻底移除代码中的本地 fallback 分支，仅保留开发期使用

### 2. CloudRun 仍不可用

当前环境 `cloud1-9gywyqe49638e46f` 没有开通云托管，所以后台 API 只能先跑在云函数网关。

这不是功能阻塞，但会影响：

- 长连接与长耗时任务承载
- 更复杂的后台服务拆分
- 后续容器化部署策略

### 3. 管理端高级模块仍未全部迁完

当前还未完全收口的后台域：

- branch-agents
- n-system
- admins
- ops-monitor
- dealers 的独立模型与完整审批流

## 结论

要把这个项目推进到“下一次即可投产”，必须先完成四件事：

1. 接通正式支付
2. 接通真实物流
3. 清理后台占位接口并补齐 `branch-agents / n-system / admins / ops-monitor`
4. 继续完成旧字段清理和内容域 `file_id` 主写

在这四件事完成之前，当前项目更准确的状态是：

**可测试、可联调、可局部试运营，但不建议直接作为正式生产版本上线。**
