# 用户 / 分销 / 钱包契约

日期：2026-04-14

## 1. 范围

覆盖以下链路：

- 登录与用户初始化
- 用户资料读取
- 分销中心
- 团队关系
- 佣金与货款余额展示
- 提现与钱包流水
- 后台用户和分销聚合

当前代码真相主要来自：

- `cloudfunctions/user/user-contract.js`
- `cloudfunctions/login/user-contract.js`
- `cloudfunctions/distribution/user-contract.js`
- `cloudfunctions/admin-api/src/user-contract.js`
- `docs/audit/2026-04-14-user-distribution-field-truth.md`
- `docs/USER_DISTRIBUTION_CONTRACT_AUDIT.md`

## 2. 正式字段

### 2.1 Canonical User

- `id`
- `openid`
- `nickname`
- `nickName`
- `avatarUrl`
- `phone`
- `role_level`
- `role_name`
- `member_no`
- `invite_code`
- `my_invite_code`
- `referrer_openid`
- `parent_id`
- `parent_openid`
- `commission_balance`
- `goods_fund_balance`
- `status_text`

### 2.2 钱包与分销展示正式语义

- `commission_balance`
  表示佣金账户余额
- `goods_fund_balance`
  表示货款账户余额
- `role_level`
  表示用户角色级别
- `role_name`
  表示角色展示文案

## 3. 只读兼容字段

以下字段允许在读取历史数据时兼容，但不能再作为真相源：

- `_id`
- `_legacy_id`
- `nickname`
  仅保留为 display alias，不再作为唯一显示字段
- `avatar_url`
  仅保留为 display alias
- `balance`
  仅兼容佣金余额旧语义
- `agent_wallet_balance`
- `wallet_balance`
- `distributor_level`
- `level`
- `agent_level`

## 4. 写入规则

- 业务主身份统一是 `openid`
- 外部返回统一使用 `id`
- 关系主字段统一使用 `referrer_openid`
- 余额语义必须明确区分 `commission_balance` 与 `goods_fund_balance`
- 页面和后台不得再自己推断 `balance` 到底是哪本账

## 5. 页面消费规则

页面和后台 consumer 优先消费：

- `nickname` 或 `nickName`
  但必须来自 canonical user，而不是各页自行回退多个字段
- `avatarUrl`
- `role_level`
- `role_name`
- `commission_balance`
- `goods_fund_balance`
- `status_text`

## 6. 当前未清债务

- `_legacy_id` 兼容查询仍存在
- 关系字段多入口查询仍存在
- 钱包与分销局部页面仍保留历史 fallback
- 某些展示位仍直接读取 `nickname` / `avatar_url`

## 7. 验证

必须通过：

- `npm run audit:user-distribution-contract`
- 相关文件 `node --check`
- `cd admin-ui && npm run build`

涉及主链改动时，还应补充：

- 登录 smoke
- 邀请关系绑定 smoke
- 分销中心 smoke
- 钱包页 smoke
- 提现申请和记录查询 smoke
