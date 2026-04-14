# 企业级规范化收口任务清单

日期：2026-04-14

# Implementation Plan

- [x] 1. 建立规范化总入口
  - 新建 `docs/standards/enterprise-hardening/` 目录
  - 写入总入口、需求、设计、任务清单
  - 固定专题契约、修复模板、验收门槛、最终交付文档位置
  - _Requirement: R1, R2, R3, R4, R6_

- [x] 2. 固定首批专题契约
  - 输出订单、用户分销、配置内容、请求传输四个专题契约文档
  - 对齐现有 `docs/audit/*.md` 和 `docs/*_AUDIT.md` 证据
  - 明确正式字段、只读兼容字段、禁止新增项
  - _Requirement: R2, R7, R8_

- [x] 3. 固定修复文档模板和首份基线修复报告
  - 输出统一 repair 模板
  - 基于当前已落地的 canonical contract 工作，生成首份修复基线报告
  - _Requirement: R3, R6_

- [x] 4. 固定验收与发布前交付文档
  - 输出本地门槛、预发门槛、发布检查表
  - 输出发布执行手册和回滚方案
  - _Requirement: R4, R5, R6_

- [ ] 5. Wave 2 深收订单 / 支付 / 退款 writer 与副作用边界
  - 已完成第一轮 writer / consumer 收口，见 `repairs/2026-04-14-order-main-writer-consumer-tightening.md`
  - 已完成第二轮并行深收口，见 `repairs/2026-04-14-order-main-parallel-wave2-round2.md`
  - 清理 writer 侧旧字段写入
  - 把支付回调、退款完成、物流回填的跨域副作用继续外提
  - 让页面只消费正式字段和正式文案
  - 每轮改动后补 `repairs/YYYY-MM-DD-order-main-*.md`
  - _Requirement: R2, R3, R4, R7, R8_

- [ ] 6. Wave 3 深收用户 / 分销 / 钱包身份与余额语义
  - 统一 `openid / id / _id / _legacy_id` 规则
  - 统一 `referrer_openid / parent_id / parent_openid` 规则
  - 收缩余额和角色状态的本地 fallback
  - 每轮改动后补 `repairs/YYYY-MM-DD-user-distribution-*.md`
  - _Requirement: R2, R3, R4, R7, R8_

- [ ] 7. Wave 4 深收配置 / 内容 / 请求传输层
  - 固化 `config` 与 `admin-api` DTO
  - 收缩首页内容位和素材的 legacy payload 主逻辑
  - 把 `utils/request.js` 降级为受控 transport，不再扩张职责
  - 每轮改动后补 `repairs/YYYY-MM-DD-config-transport-*.md`
  - _Requirement: R2, R3, R4, R7, R8_

- [ ] 8. Wave 5 补齐验证闭环和发布前交付包
  - 执行全部本地阻断门槛
  - 完成预发阻断门槛和真机联调记录
  - 生成最终交付文档、发布前检查结果、已知残余风险
  - _Requirement: R4, R5, R6, R8_
