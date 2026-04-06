# N级别独立代理系统 — 完整实现方案

> 分析日期：2026-03-28
> **实现状态：已完成（2026-03-28）**
> 基于当前后端代码深度阅读后输出，结合现有 role_level / AgentWallet / UpgradeApplication 体系。

---

## 一、现有体系与 N 级别的精确对应关系

```
现有 role_level    现有名称          N级别新含义         门槛（现有 → 调整后）
────────────────────────────────────────────────────────────────────
0  GUEST           普通用户          不变               -
1  MEMBER (C1)     初级代理          不变               购买 ¥299
2  LEADER (C2)     高级代理          不变               推 2 个C1 + 销售580
3  AGENT  (B1)     推广合伙人        N 下属普通代理      缴纳 ¥3000（不变）
4  PARTNER(B2)     运营合伙人  →     N 独立代理          缴纳 ¥30,000（不变！完全匹配）
5  REGIONAL(B3)    区域合伙人  →     N 区域独立代理      ¥198,000 → 改为 ¥90,000
                                     + 区域唯一性
```

**关键发现：B2 门槛 30,000 元与 "N级别3万" 完全吻合，B3 门槛需要从 198,000 调整为 90,000。**
主要工作是：在现有角色体系上叠加 6 个新功能模块，而不是重建角色体系。

---

## 二、功能模块清单（共 6 个）

### 模块 A：B3 门槛调整（3w推荐3个3w → 9w升级路径）

**调整点**

1. `constants.js` 中 `PARTNER_TO_REGIONAL.recharge_amount` 从 `198000` → `90000`
2. 新增第二条升级路径：B2 代理推荐 **3 个 B2 直属下级**，自动触发 B3 升级
3. `checkRoleUpgrade`（`utils/commission.js`）增加新判断分支

**核心逻辑**

```js
// utils/commission.js — checkRoleUpgrade 中 B2→B3 分支新增
const directB2Referees = refereesByLevel[4] || 0;  // 直推B2人数
if (user.role_level === 4) {
  const rule = UPGRADE_RULES.PARTNER_TO_REGIONAL;
  // 原有：缴纳 9w
  const byRecharge = user.total_recharge >= rule.recharge_amount;
  // 新增：直推 3 个 B2
  const byReferee = directB2Referees >= 3;
  if (byRecharge || byReferee) { /* 触发 B3 升级 */ }
}
```

**平级处理**：B1 升级为 B2（3w 独立代理）时，若其原 `parent_id` 也是 B2，则两人变平级：
- 新 B2 的 `parent_id` 更新为原 B2 的 `parent_id`（跳过原上级，接入上级的上级）
- 或设置为 `null`（完全独立）
- `agent_id = self.id`（已有逻辑，保持）
- **需在 `handleAgentPromotion` 中新增此逻辑**

---

### 模块 B：定向邀约代理（N 转移 3000 货款赋予代理位）

**业务规则**

- 仅 B2/B3（role_level ≥ 4）可操作
- 从自己的 `AgentWalletAccount` 扣除 ¥3000
- 被邀约人：若 role_level < 3，直接升为 B1（role_level=3），`parent_id = 邀约人.id`
- 若被邀约人已是 B1，直接绑定关系（不重复扣款，或仅补差价）
- 记录邀约日志（新增模型）

**需新建文件**

```
backend/models/AgentInviteLog.js
```

```js
// AgentInviteLog 字段
{
  id, inviter_id, invitee_id,
  amount: 3000,           // 转移货款金额
  status: 'completed',   // pending / completed / failed
  note: string,
  created_at, updated_at
}
```

**需新建 API**

```
POST /api/agent/invite-sub-agent
Body: { invitee_user_id, note? }
```

**处理流程**

```
1. 校验：inviter role_level >= 4
2. 校验：inviter AgentWalletAccount.balance >= 3000
3. 事务开始
   a. AgentWalletService.deduct(inviter_id, 3000, 'invite_agent')
   b. invitee.role_level < 3 → 升为 3，设 parent_id = inviter_id
   c. invitee.role_level === 3 → 更新 parent_id = inviter_id（若未绑定）
   d. 写 AgentInviteLog
4. 事务提交
```

**涉及修改文件**

- `backend/routes/agent.js`：新增路由 `router.post('/invite-sub-agent', ...)`
- `backend/services/AgentWalletService.js`：新增 `change_type = 'invite_agent'`
- `backend/models/AgentWalletLog.js`：确认枚举支持新类型

---

### 模块 C：货款充值仅流向 N 级别（充值闭环）

**业务规则**

- B1 代理（role_level=3）的货款充值不直接到自己账户
- 应向其 N 级上级（role_level ≥ 4 的直接上级）发起充值请求
- N 级别收到资金后，可手动给 B1 充值（下发货款）

**两种实现选择（请确认方向）**

| 方案 | 说明 | 复杂度 |
|------|------|--------|
| 方案一：N 代充 | B1 申请充值 → N 审核 → N 从自身货款账户划拨给 B1 | 中 |
| 方案二：资金归集 | B1 微信充值 → 款项进 N 的货款账户（而非 B1 自己） | 高（需重写支付回调） |

**推荐方案一（最小改动）**

新增 API：
```
POST /api/agent/recharge-sub-agent     # N 下发货款给 B1
Body: { sub_agent_id, amount }

GET  /api/agent/sub-agents             # N 查看所有下级 B1
```

**涉及修改文件**

- `backend/routes/agent.js`
- `backend/services/AgentWalletService.js`：新增 `transfer(fromId, toId, amount, type)` 方法

---

### 模块 D：兑换券系统（N 用货款购买，赠送给下属）

**业务规则**

- N 级别用货款购买「特定商品的一次性兑换券」
- 兑换券可赠送给自己名下的 B1 代理
- B1 使用兑换券时，走正常订单流程但价格为 ¥0（或商品成本价）

**需新建文件**

```
backend/models/ProductVoucher.js
```

```js
// ProductVoucher 字段
{
  id,
  product_id,           // 指定商品（或 null = 通用）
  sku_id,               // 指定规格
  face_value,           // 兑换价值（元）
  cost_amount,          // N 购买时扣除的货款金额
  issuer_id,            // 发行人（N的 user_id）
  recipient_id,         // 接收人（B1 user_id），null=未发放
  status: 'available' | 'granted' | 'used' | 'expired',
  granted_at,
  used_at,
  order_id,             // 使用时关联的订单
  expires_at,
  created_at, updated_at
}
```

**需新建 API**

```
POST /api/agent/vouchers/purchase     # N 购买兑换券（扣货款）
POST /api/agent/vouchers/grant        # N 赠送给下属
GET  /api/agent/vouchers              # N 查看己方兑换券库存
GET  /api/user/vouchers               # B1 查看收到的兑换券
POST /api/order/use-voucher           # 下单时使用兑换券
```

**涉及修改文件**

- `backend/services/OrderCoreService.js`：下单时支持 `voucher_id` 参数，校验并核销
- `backend/routes/agent.js`：新增兑换券路由
- `backend/services/AgentWalletService.js`：购券时扣货款，`change_type = 'purchase_voucher'`

---

### 模块 E：9w 区域 N 唯一性约束

**业务规则**

- role_level=5（9w 区域 N）在申请时必须绑定一个区域
- 同一区域只能有一个 role_level=5 的 N
- 参考现有 `ServiceStation` + `StationClaim` 的认领机制

**实现方案：复用 branch_agent 的区域机制**

在 `User` 模型或 `UpgradeApplication` 里新增 `region_code` 字段：

```js
// User 模型新增字段
region_code: DataTypes.STRING,        // 区域编码（仅B3使用）
region_name: DataTypes.STRING,        // 区域名称显示用
```

升级审核时（`adminUpgradeController`）：
```js
// 审核 B3 升级前检查
if (targetLevel === 5) {
  const existing = await User.findOne({
    where: { role_level: 5, region_code: application.region_code }
  });
  if (existing) return res.json({ code: -1, message: '该区域已有区域N代理' });
}
```

**涉及修改文件**

- `backend/models/User.js`：新增 `region_code`, `region_name`
- `backend/models/UpgradeApplication.js`：新增 `region_code` 字段（申请时填写）
- `backend/routes/admin/controllers/adminUpgradeController.js`（或 `adminSettingsController`）：审核时校验区域唯一性
- `miniprogram`：B3 申请升级页面新增区域选择

---

### 模块 F：独立代理 10% 奖金

**业务规则**（待确认：是否指 B2 代理在销售提成之外额外获得 10%？）

**推测为**：B2/B3（N级别）代理的下属 B1 产生订单完成后，N 额外获得订单金额的 10% 作为「独立代理管理奖金」。

**实现位置**：`CommissionService.js` → `calculateOrderCommissions` 或 `calculateGapAndFulfillmentCommissions`

```js
// 在给 parent 计算佣金后，额外给 N 级别 (role_level >= 4) 的上级
if (topAgent && topAgent.role_level >= 4) {
  const independentBonus = orderAmount * 0.10;
  commissions.push({
    user_id: topAgent.id,
    amount: independentBonus,
    type: 'independent_agent_bonus',
    note: '独立代理管理奖金10%'
  });
}
```

**涉及修改文件**

- `backend/services/CommissionService.js`
- `backend/models/CommissionLog.js`：确认 `commission_type` 枚举支持新类型

---

## 三、数据库变更汇总

### 需新增字段

```sql
-- users 表
ALTER TABLE users ADD COLUMN region_code VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN region_name VARCHAR(100) DEFAULT NULL;

-- upgrade_applications 表（B3申请时填写目标区域）
ALTER TABLE upgrade_applications ADD COLUMN region_code VARCHAR(50) DEFAULT NULL;
```

### 需修改常量

```js
// constants.js
PARTNER_TO_REGIONAL: {
  recharge_amount: 90000,  // 原 198000 → 改为 90000
  referee_count_at_level: 3,  // 新增：直推 3 个 B2 也可升
  referee_min_level: 4,       // 新增
}
```

### 需新建表

| 表名 | 说明 |
|------|------|
| `agent_invite_logs` | 定向邀约记录（N 转移 3000 货款邀约 B1） |
| `product_vouchers` | 商品兑换券（N 购买并赠送给 B1）|

---

## 四、文件修改清单（按优先级排序）

### 第一优先级（门槛和升级路径）

| 文件 | 改动 |
|------|------|
| `backend/config/constants.js` | B3 门槛改 90k，新增 B2→B3 推荐路径配置 |
| `backend/utils/commission.js` | `checkRoleUpgrade` B2→B3 新增推荐路径；`handleAgentPromotion` 新增平级处理 |
| `backend/models/User.js` | 新增 `region_code`, `region_name` 字段 |
| `backend/models/UpgradeApplication.js` | 新增 `region_code` 字段 |

### 第二优先级（定向邀约）

| 文件 | 改动 |
|------|------|
| `backend/models/AgentInviteLog.js` | **新建** |
| `backend/models/index.js` | 注册新模型 |
| `backend/routes/agent.js` | 新增 `/invite-sub-agent`、`/recharge-sub-agent`、`/sub-agents` |
| `backend/services/AgentWalletService.js` | 新增 `transfer()` 方法，新增 `change_type` |

### 第三优先级（兑换券）

| 文件 | 改动 |
|------|------|
| `backend/models/ProductVoucher.js` | **新建** |
| `backend/models/index.js` | 注册 ProductVoucher |
| `backend/services/OrderCoreService.js` | 下单支持 `voucher_id` 参数 |
| `backend/routes/agent.js` | 兑换券路由 |

### 第四优先级（区域唯一性 + 奖金）

| 文件 | 改动 |
|------|------|
| `backend/routes/admin/controllers/adminUpgradeController.js` | 审核 B3 时校验区域唯一性 |
| `backend/services/CommissionService.js` | N 级别 10% 管理奖金 |
| `backend/models/CommissionLog.js` | 新 commission_type |

---

## 五、仍需主人确认的关键问题

| # | 问题 | 选项 |
|---|------|------|
| 1 | **B1 充值流向** | A）B1 自己充值，N 再下发 / B）B1 充值直接归入 N 的账户 |
| 2 | **独立奖金 10% 的触发条件** | 是 N 的直属 B1 产生销售就给？还是仅在某个条件下（如 B1 升级后的奖励）？ |
| 3 | **平级后的关系** | B1 升 B2 后，是接入原 B2 上级的树（间接独立）？还是彻底断开（parent_id=null）？ |
| 4 | **兑换券的范围** | 指定商品（从商品库选择）？还是类似「代金券」（金额形式）？ |
| 5 | **B3 区域申请方式** | 升级申请时填区域？还是升级后再单独申请区域？ |
| 6 | **角色名称更新** | 前端/admin 是否同步把「运营合伙人/区域合伙人」改为「N独立代理/N区域代理」？ |

---

## 六、作者自评与项目观察

### 做得好的地方
- `AgentWalletService` 与 `CommissionService` 分离得非常清晰，两者互不干扰，扩展性很好
- `AppConfig` 动态配置机制非常适合做「门槛调整」这类需求，不需要发版
- `UpgradeApplication` 审核流程已有完整的支付闭环，新功能可复用这个骨架

### 值得关注的风险
- `checkRoleUpgrade` 里「高等级计入低等级」的循环逻辑有 bug（`refereesByLevel` 累加没有向下传递），**在实现「3个B2升B3」之前必须先修这个 bug**，否则推荐人数统计会错
- `PointService.addPoints` 里 `newLevel` 未定义的瑕疵，在等级权益体系扩展时可能触发
- `featureToggles.js` 中 `agent` 开关实际上不控制后端佣金接口，只是前端展示开关，文件注释已说明——但不熟悉此项目的人容易误以为关掉它能关闭代理功能，建议加注释说明
- `role_level` 注释仍写旧四档（已有五档），每次查 User.js 时容易迷路，建议同步更新注释

### 可以废弃/精简的
- `backend/utils/featureToggles.js`：6个开关里后端实际读取的极少，基本已架空，可考虑整合进 `runtimeBusinessConfig.js` 或 `AppConfig`
