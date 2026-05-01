# 业务机制收口方案

日期：2026-05-01

## 1. 背景

当前 `cloud-mp` 已经形成真实业务闭环，但多个机制正在解决相邻问题：

- 成长值会员、代理等级、团队晋升都在解释用户身份和权益。
- 积分、成长值、优惠券、兑换券、抽奖都在解释用户权益资产。
- 佣金、货款、提现、存钱罐、基金池都在解释代理资金。
- 拼团、砍价、限时、组合包、兑换商品都在解释活动成交。
- `configs`、`admin_singletons`、旧配置 key 和后台多个配置页都在解释运营参数。

本方案目标不是新增功能，而是把这些机制收成少数几个业务中心，降低用户、运营和研发的理解成本。

## 2. 总原则

1. 合心智，不轻易合账本。
2. 合入口，不直接删除流程表。
3. 合配置口径，保留必要兼容读取。
4. 先改文档、导航、文案和配置分组，再改数据结构。
5. 所有资金、订单、退款相关改动必须以可审计流水为前提。

## 3. 目标业务中心

| 中心 | 收口后的职责 | 主真相 |
| --- | --- | --- |
| 用户与渠道中心 | 用户身份、代理等级、团队关系、邀请码、门店 / 分支代理身份 | `users.role_level`、`referrer_openid`、`parent_openid` |
| 交易中心 | 商品、活动成交、订单、支付、退款、履约 | `orders`、`refunds`、`payment_method`、`delivery_type` |
| 权益中心 | 成长值、积分、优惠券、兑换券、抽奖 | `growth_value`、`points`、`user_coupons`、`point_logs` |
| 资金中心 | 佣金、货款、提现、存钱罐、基金池、财务流水 | `commission_balance`、`goods_fund_balance`、`commissions`、`wallet_logs`、`goods_fund_logs` |
| 运营配置中心 | 首页内容、活动配置、会员 / 代理规则、物流、弹窗、开关 | `configs`、`admin_singletons` |

## 4. 机制归并口径

### 4.1 会员 / 代理 / 成长值

收口结论：

- `role_level` 是唯一身份等级字段。
- 成长值是升级进度和复购激励，不再作为独立身份体系。
- 初级会员、高级会员、推广合伙人、运营合伙人、区域合伙人、门店都属于同一套 `role_level` 语义。
- 会员中心只解释成长权益与当前身份，不再制造第二套会员等级心智。

保留：

- `growth_value`
- `point_logs`
- `member_upgrade_rule_config`
- `growth_rule_config`
- `growth_tier_config`

逐步弱化：

- `level`
- `level_name`
- `distributor_level`
- `agent_level`
- 与真实定价或真实佣金无关的会员策略展示字段

### 4.2 邀请 / 团队 / 定向邀请 / 分支代理

收口结论：

- 这些统一归入用户与渠道中心。
- `referrer_openid` / `parent_openid` 是当前团队归属主字段。
- `invite_code` / `my_invite_code` 是传播入口，不是另一套身份。
- `directed_invites` 是关系改挂或定向邀请流程表，不是用户主表。
- 分支代理和经销商应作为渠道资料或运营视角，不应另起一套用户体系。

保留：

- `users`
- `directed_invites`
- `promotion_logs`
- `promotion_lineage_logs`
- 现有团队、邀请、渠道审核页面

治理：

- `branch_agent_*` 继续按集合契约标记为兼容残留，先评估再处理。

### 4.3 积分 / 成长值 / 优惠券 / 兑换券 / 抽奖

收口结论：

- 这些统一归入权益中心。
- 积分是可消费资产。
- 成长值是等级进度。
- 优惠券和兑换券是权益凭证。
- 抽奖、兑换和活动商品是权益消耗场景。

页面口径：

- 用户页只展示权益摘要。
- 积分页只讲积分余额、签到、积分流水和积分消费入口。
- 会员中心只讲成长值、身份权益和升级路径。
- 优惠券页只讲券资产与可用场景。

### 4.4 佣金 / 货款 / 存钱罐 / 基金池 / 提现

收口结论：

- 这些统一归入资金中心。
- 佣金账和货款账必须继续分账。
- 存钱罐是升级激励预算桶，解锁后才进入佣金或钱包流水。
- 基金池是升级或特定策略的预算流水，不是货款流水。

不可合并：

- `commission_balance` 与 `goods_fund_balance`
- `commissions` 与 `goods_fund_logs`
- `upgrade_piggy_bank_logs` 与 `wallet_logs`
- `fund_pool_logs` 与 `goods_fund_logs`

可合并：

- 后台导航分组
- 小程序资金入口
- 财务中心聚合展示
- 审核和对账说明

### 4.5 拼团 / 砍价 / 限时 / 组合包 / 兑换商品

收口结论：

- 这些统一归入交易中心下的活动成交玩法。
- 活动配置决定成交上下文，订单创建仍统一落 `orders`。
- 不再把每种玩法包装成独立业务体系。

保留：

- `group_*`
- `slash_*`
- `limited_sale_slots`
- `limited_sale_items`
- `product_bundles`
- 订单快照中的活动字段

### 4.6 配置入口

收口结论：

- 新配置优先写 `configs` / `admin_singletons`。
- `app_configs` 只兼容读取。
- `agent_system_*` 与 `member_*` 重复 key 需要确定 canonical key。
- 后台配置页按业务中心分组，而不是按历史开发批次分组。

## 5. 分阶段执行

### Phase 1：文档与清单

目标：

- 建立业务中心收口口径。
- 输出页面、集合、云函数归属表。

动作：

1. 新增本方案作为业务机制收口入口。
2. 补一份 `business-mechanism-inventory`，列出页面、集合、云函数、配置 key 的中心归属。
3. 标记每项为：保留、合入口、只兼容、待归档、不可合并。

验收：

- 每个重要页面、集合、云函数、配置 key 都能归入一个中心。
- 标记为不可合并的资金和流程表有明确理由。

### Phase 2：后台导航与配置页收口

目标：

- 先降低运营理解成本。

动作：

1. 将会员策略重命名或重组为“身份与权益规则”。
2. 将佣金、提现、货款、基金池、存钱罐归入“资金中心”分组。
3. 将用户、团队、经销商、分支代理、门店归入“用户与渠道”分组。
4. 将拼团、砍价、限时、组合包、兑换商品归入“活动成交”分组。
5. 保留原路由兼容，先只改导航分组与页面标题。

验收：

- 后台导航不再把同一机制拆成多个互相竞争的入口。
- 原有路由可访问，权限不漂移。

### Phase 3：小程序前台心智收口

目标：

- 降低用户对会员、积分、成长值、代理、钱包的理解成本。

动作：

1. 用户页展示当前身份、成长值进度、积分、券、资金入口。
2. 会员中心聚焦成长权益和升级路径。
3. 积分页聚焦积分资产和积分消费场景。
4. 分销中心聚焦团队、佣金、邀请、货款。
5. 活动页聚合拼团、砍价、限时、组合包和兑换商品。

验收：

- 同一概念在不同页面不出现冲突文案。
- 用户不需要理解“成长值会员”和“代理等级”两套身份。

### Phase 4：配置 key 与兼容字段治理

目标：

- 将业务口径落到配置和字段真相源。

动作：

1. 确定 `agent_system_*` / `member_*` canonical key。
2. 把 `app_configs` 降级为只读兼容。
3. 压缩 `level`、`level_name`、`distributor_level`、`agent_level` 的使用面。
4. 压缩 `balance`、`wallet_balance`、`agent_wallet_balance` 的使用面。
5. 统一 `wallet_logs.type` / `change_type` 写入口径。

验收：

- 新代码只写 canonical key 和 canonical 字段。
- 兼容字段只出现在 contract normalize 或历史读取层。

### Phase 5：代码结构收口

目标：

- 把业务中心口径落到代码组织和测试。

动作：

1. 抽共享角色 / 权益 / 资金文案映射，减少多处硬编码。
2. 为用户与渠道、权益、资金三个中心补 smoke。
3. 对配置读取加审计脚本，禁止新增重复 key 族。
4. 逐步删除已验证无依赖的旧入口和旧字段主逻辑。

验收：

- `npm run audit:user-distribution-contract`
- `npm run audit:config-content-contract`
- `npm run audit:miniprogram-routes`
- 相关云函数 `node --check`
- `cd admin-ui && npm run build`

## 6. 优先级

| 优先级 | 收口项 | 原因 |
| --- | --- | --- |
| P0 | 会员 / 代理 / 成长值 | 心智重复最明显，已有代码基本融合，风险低 |
| P0 | 后台导航与配置页分组 | 直接降低运营配置成本，不触碰账本 |
| P1 | 权益中心口径 | 积分、成长值、券、抽奖容易让用户混淆 |
| P1 | 资金中心入口 | 入口可合，但账本不能合，需谨慎 |
| P2 | 活动成交玩法 | 涉及订单创建，回归面较大，最后推进 |
| P2 | 旧字段和旧 key 删除 | 需要 live 数据审计后再做 |

## 7. 风险与边界

- 不能因为“看起来重复”就合并财务账本。
- 不能把流程表直接压扁回主表。
- 不能先删旧字段，再处理 live 历史数据。
- 不能让后台导航改名导致权限 key 漂移。
- 不能让小程序文案改动掩盖真实未实现能力。

## 8. 关联文档

- [业务机制归属清单](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/plans/2026-05-01-business-mechanism-inventory.md)
- [当前业务架构与完整性审查](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/architecture/current-business-architecture.md)
- [CloudBase 集合契约](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/architecture/cloudbase-collection-contract.md)
- [用户 / 分销 / 钱包契约](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/standards/enterprise-hardening/contracts/user-distribution.md)
- [配置 / 内容契约](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/standards/enterprise-hardening/contracts/config-content.md)
- [全量数据库与业务代码整改计划](/C:/Users/21963/WeChatProjects/zz/cloud-mp/docs/plans/2026-04-19-full-database-business-remediation.md)
