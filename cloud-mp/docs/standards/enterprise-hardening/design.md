# 企业级规范化收口设计

日期：2026-04-14

## 1. 设计目标

本设计解决三个问题：

1. 规范文档入口分散，导致实现、审计、修复难以对齐。
2. 主链契约虽已有代码骨架，但缺少统一的人工维护规范。
3. 验收口径和发布前交付物缺少稳定模板，难以形成可复制流程。

## 2. 总体设计

采用“规范层 + 证据层 + 修复层 + 发布层”四层结构。

### 2.1 规范层

位置：

- `docs/standards/enterprise-hardening/`

职责：

- 说明项目应该如何被收口
- 固定字段和接口契约
- 固定兼容策略和禁止事项
- 固定任务顺序和验收门槛

### 2.2 证据层

位置：

- `docs/*.md`
- `docs/*.json`
- `docs/audit/*.md`

职责：

- 记录脚本审计结果
- 记录字段真相表
- 记录当前代码状态的客观证据

规则：

- 证据层不负责解释“应该怎样”
- 证据层只负责说明“现在是什么”

### 2.3 修复层

位置：

- `docs/standards/enterprise-hardening/repairs/`

职责：

- 一轮一文档
- 固定模板
- 记录每次修复的根因、策略、验证和剩余债务

### 2.4 发布层

位置：

- `docs/standards/enterprise-hardening/acceptance/`
- `docs/release/`

职责：

- 定义本地阻断门槛
- 定义预发阻断门槛
- 定义发布和回滚执行流程

## 3. 模块边界

### 3.1 订单主链

当前正式契约骨架位于：

- `cloudfunctions/order/order-contract.js`
- `cloudfunctions/admin-api/src/order-contract.js`
- `cloudfunctions/order/order-query.js`
- `cloudfunctions/order/order-lifecycle.js`

边界规则：

- contract 负责字段归一化、状态和文案映射
- query / lifecycle 负责 canonical DTO 组装和 writer 侧落库
- 页面和后台 consumer 不再自己推导核心状态文案

### 3.2 用户 / 分销主链

当前正式契约骨架位于：

- `cloudfunctions/user/user-contract.js`
- `cloudfunctions/login/user-contract.js`
- `cloudfunctions/distribution/user-contract.js`
- `cloudfunctions/admin-api/src/user-contract.js`

边界规则：

- 用户身份、关系、余额统一由 contract 归一
- 页面只消费 canonical user 字段
- 深层 `_legacy_id` 兼容逻辑只能逐步下沉和收缩

### 3.3 配置 / 内容主链

当前正式契约骨架位于：

- `cloudfunctions/config/config-contract.js`
- `cloudfunctions/admin-api/src/config-contract.js`
- `cloudfunctions/config/index.js`

边界规则：

- `miniProgramConfig`、`homeContent`、`popupAd`、`homeSections` 的 DTO 在 contract 层固定
- 页面和后台不再自行拼装旧 payload 作为主逻辑

### 3.4 小程序请求传输层

当前入口位于：

- `miniprogram/utils/request.js`

现状判断：

- 它是 transport adapter
- 它也是隐藏的第二套接口契约

收口规则：

- 新功能不得直接把业务逻辑塞进 request 层
- `ROUTE_TABLE` 作为兼容映射保留，但只能增受控映射，不能扩展新职责
- 路由审计输出是 `docs/audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`

## 4. 兼容策略

兼容策略分三档：

### 4.1 正式字段

定义：

- 当前唯一真相源
- 新代码只读写这些字段

### 4.2 只读兼容字段

定义：

- 允许读取历史数据
- 不允许继续作为 writer 落库主字段

### 4.3 待移除字段

定义：

- 当前仅为平滑迁移临时保留
- 必须在专题契约文档中显式列出
- 移除前需要 repair 文档和回归验证

## 5. 修复工作流

每一轮修复固定按以下顺序执行：

1. 复现问题并定位断点
2. 更新对应专题契约或字段真相表
3. 先修 contract / normalizer / assembler / writer
4. 再修 reader / page / admin consumer
5. 删除安全可删的本地 fallback
6. 执行本地阻断门槛
7. 产出 repair 文档
8. 更新最终交付文档

## 6. 验证设计

### 6.1 本地验证

本地验证由四部分组成：

- 合同审计
- 语法与构建检查
- 主链 smoke
- 文档一致性检查

### 6.2 预发验证

预发验证由三部分组成：

- 环境与配置检查
- 后台 / 小程序主链联调
- 发布与回滚准备度确认

### 6.3 证据落点

脚本证据继续落在现有 `docs/*.md|json`。  
人工解释和验收口径统一落在本目录。  
发布执行资料统一落在 `docs/release/`。

## 7. 风险与限制

当前最大的实现风险仍然是：

- 深层历史兼容字段尚未完全退出
- `cloudfunctions/admin-api/src/app.js` 仍然过重
- `miniprogram/utils/request.js` 仍然是高耦合 transport
- 预发和真机验证尚未实际执行

因此本轮文档设计默认采用：

- 保持外部接口兼容
- 先冻结规范
- 再按波次深收口
- 最后才执行发布前联调
