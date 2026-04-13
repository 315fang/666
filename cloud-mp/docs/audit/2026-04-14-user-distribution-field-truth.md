# 用户与分销主链字段真相表（Phase 2）

日期：2026-04-14

本表覆盖第二阶段：

- 登录用户信息
- 用户资料
- 分销中心
- 团队成员
- 佣金账户
- 货款账户
- 后台用户列表/详情

## 1. 用户身份与关系字段

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 主键 | `id`(DTO) / `_id`(存储) | 外部统一返回 `id`，内部文档主键为 `_id` | `id`, `_legacy_id` | `_legacy_id` 只用于历史兼容查询 |
| 用户身份 | `openid` | 用户业务主身份 | - | 所有业务链仍以 `openid` 为正式主身份 |
| 上级关系 | `referrer_openid` | 业务推荐关系正式字段 | `parent_openid` | 新代码优先读 `referrer_openid` |
| 上级引用 | `parent_id` | 文档/用户引用字段 | - | 允许保留，但不再扩散出新的别名 |
| 上级 openid | `parent_openid` | 兼容保留 | - | 新代码不以它作为首选真相源 |

## 2. 余额字段

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 佣金余额 | `commission_balance` | 正式佣金账户余额 | `balance` | `balance` 仅作为兼容别名输出 |
| 货款余额 | `goods_fund_balance` | 正式货款账户余额 | `agent_wallet_balance`, `wallet_balance` | 两个旧字段都由 `goods_fund_balance` 推导 |
| 货款余额(兼容) | `agent_wallet_balance` | 兼容字段 | - | 仍保留给旧页面 |
| 货款余额(兼容) | `wallet_balance` | 兼容字段 | - | 仍保留给旧页面 |

## 3. 用户展示字段

| 领域 | 正式字段 | 含义 | 兼容字段 | 说明 |
| --- | --- | --- | --- | --- |
| 昵称 | `nickname` | 正式展示昵称 | `nickName`, `nick_name` | 继续兼容双写，但真相源是 `nickname` |
| 头像 | `avatar_url` | 正式头像字段 | `avatarUrl`, `avatar` | 真相源是 `avatar_url` |
| 角色等级 | `role_level` | 正式角色等级 | `distributor_level`, `level` | 读取时兼容，DTO 统一输出 `role_level` |
| 角色文案 | `role_name` | 正式角色文案 | `level_name` | `level_name` 仅兼容保留 |
| 状态文案 | `status_text` | 用户状态展示文案 | - | 页面优先读这个字段 |

## 4. Phase 2 规则

1. 所有用户 DTO 必须稳定输出：
   - `id`
   - `openid`
   - `nickname`
   - `avatar_url`
   - `role_level`
   - `role_name`
   - `referrer_openid`
   - `parent_id`
   - `commission_balance`
   - `goods_fund_balance`
2. `balance = commission_balance`
3. `agent_wallet_balance = goods_fund_balance`
4. `wallet_balance = goods_fund_balance`
5. 新代码不得继续新增新的身份或余额别名
