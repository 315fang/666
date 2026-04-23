# 全量数据库与业务代码整改计划

日期：2026-04-19  
来源：基于 [2026-04-19-full-database-business-audit.md](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/audit/2026-04-19-full-database-business-audit.md)

## 1. 目标

本轮整改目标不是继续堆功能，而是恢复以下四件事的单一真相源：

1. 数据源
2. 角色体系
3. 财务流水契约
4. 配置键名与配置读取策略

## 2. Phase 1：真相源收口

### 2.1 本地/线上数据源说明收口

- 明确文档写清：
  - 本地 `admin-api` 默认是 `filesystem`
  - 线上运行才是 CloudBase live
- 在本地开发入口加明显提示，避免误把 `.runtime/overrides` 当线上真相
- 为本地与线上分别提供固定审计命令

### 2.2 审计工具修复

- 修 [scripts/check-cloudbase-runtime-status.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/check-cloudbase-runtime-status.js:229)
  - `listCollections` 改为完整分页或 `limit=500`
  - 禁止再用前 100 个集合推断“缺失”
- 将 `CLOUDBASE_ENV_RUNTIME_STATUS` 报告改为可重复运行且不会误报

## 3. Phase 2：角色体系收口

### 3.1 决定 N 路径命运

- 二选一：
  - 正式支持 `role_level 7`，则 CloudBase admin-ui、小程序、用户契约、权限校验全部补齐 7
  - 不再支持 N 路径，则制定 live 用户迁移/降级/归档方案，彻底移除旧后端 6/7 逻辑入口

### 3.2 角色展示与写入统一

- 所有角色文案来源统一到一处
- CloudBase admin-api 的角色写入校验、前端角色枚举、live 用户数据必须一致

## 4. Phase 3：财务链路收口

### 4.1 `wallet_logs` / `goods_fund_logs` 契约统一

- 统一日志字段：
  - `wallet_logs` 只允许 `change_type`
  - `goods_fund_logs` 只允许 `type`
- `appendWalletLogEntry()` 与所有调用点统一做字段归一化
- 为历史 `wallet_logs.type` 记录做一次只改字段不改金额的迁移

### 4.2 退款对账修复

- 针对当前审计抓出的 8 笔内部货款退款缺日志问题，逐笔回放并补账
- 新增审计脚本回归校验，确保退款完成、退款回退、货款冲正三条日志闭环

### 4.3 基金池收口

- 在 `recordFundPoolEntry()` 与 `recordAdminFundPoolEntry()` 增加 `enabled` 开关判断
- 明确基金池只在“升级事件”触发，不在普通订单触发
- 判断 live 历史高等级用户是否需要一次性补历史入池流水
- 后台增加基金池流水查看页，接 `fund_pool_logs`

### 4.4 分红收口

- 分红规则保存时禁止空 `ranks` 且 `enabled=true`
- 明确分红模式：
  - 若保留“真实分红池”，则补 `pool_balance` 计提/扣减逻辑
  - 若保留“人工发放器”，则去掉误导性的 `source_pct/分红池` 文案
- 后台增加分红执行明细与到账明细页
- 统一 `year_end_dividend` 在 `dividend_executions / commissions / wallet_logs` 的对账逻辑

## 5. Phase 4：配置与集合治理

### 5.1 配置 key 统一

- 选定一套 canonical key 命名：
  - 推荐全部使用横杠版 `agent_system_xxx-yyy`
- 对 `peer_bonus/peer-bonus` 之类重复 key 做数据迁移
- 清掉兼容读 fallback，只保留单一 key

### 5.2 live 集合治理

- 将 61 个 `_bak` 集合列出迁移/归档计划
- 对 `admin_logs`, `mysql`, `pickup_verifiers`, `branch_agent_*` 做逐项判定：
  - 保留并文档化
  - 迁移后删除
  - 完全归档

## 6. Phase 5：旧后端与 CloudBase 双轨治理

- 逐域指定唯一主实现：
  - 分红
  - 基金池
  - 升级
  - 钱包/货款
  - 价格
  - 佣金
- 任何一个域都不能继续同时维护 MySQL 与 CloudBase 两套业务内核
- 对仍需保留的旧后端代码加显式“只读/历史”标识，防止继续接新需求

## 7. Phase 6：工程可信度修复

- 修复 `backend` 当前失败测试：
  - `GroupCoreService.handleOrderPaid`
  - `GroupCoreService.ensureGroupOrderReadyForFulfillment`
- 对 admin-ui 构建告警做记录与分包计划，但不阻塞财务/数据收口

## 8. 验收标准

- 本地与线上数据源边界清晰，排障时不会再混淆
- live `wallet_logs` 不再出现 `type/change_type` 双字段混写
- 基金池与分红要么真正能触发并可查看流水，要么被明确降级为未启用/未上线
- `role_level` 契约在 CloudBase、admin-ui、小程序、旧后端之间只保留一套定义
- live 历史集合中 `_bak` 与旧 alias 有明确治理清单
- 后端测试重新回到全绿状态
