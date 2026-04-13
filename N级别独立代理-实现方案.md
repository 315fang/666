# N 路径代理技术说明（当前入口）

本文件名保留用于兼容历史引用，但原“完整实现方案”中的阶段性设计已经被当前实现替代。

当前 N 路径的真实技术入口请以以下内容为准：

- `backend/config/constants.js`
- `backend/routes/n-system.js`
- `backend/services/NSystemService.js`
- `backend/services/UpgradeMemberService.js`
- `backend/services/AgentWalletService.js`
- `backend/services/OrderCreationService.js`
- `admin-ui/src/views/n-system/index.vue`
- `miniprogram/pages/activity/n-invite.js`

## 1. 当前已落地的技术方案

### 1.1 角色模型

当前实现没有把 B2/B3 改造成 N 角色，而是新增独立角色：

- `role_level = 6`: 小 n
- `role_level = 7`: 大 N

用户模型通过 `n_leader_id` 维护 N 路径上下级关系。

### 1.2 核心路由

当前 N 路径主要接口在 `backend/routes/n-system.js`：

- `GET /api/n/invite-card`
- `POST /api/n/fund-request`
- `GET /api/n/my-requests`
- `GET /api/n/my-leader`
- `GET /api/n/upgrade-eligibility`
- `POST /api/n/allocate`
- `GET /api/n/members`
- `GET /api/n/fund-requests`
- `POST /api/n/fund-requests/:id/review`

### 1.3 核心服务

当前职责分布是：

- `NSystemService`: 货款申请、划拨、团队条件、脱离奖励
- `UpgradeMemberService`: `n_join` / `n_upgrade` 申请与审核
- `AgentWalletService`: 大 N 与小 n 之间的货款转账
- `OrderCreationService`: 小 n 下单时的大 N 价差锁定逻辑

### 1.4 后台与小程序入口

- 后台：`admin-ui/src/views/n-system/index.vue`
- 小程序：`miniprogram/pages/activity/n-invite.js`

## 2. 当前已经废弃的旧设想

以下说法不再代表当前实现：

- 用 B2/B3 直接承接 N 路径角色
- 把 B3 门槛改成 9 万并视为当前已生效事实
- 以本文件旧版中的候选模块清单作为当前开发基线

## 3. 当前做 N 路径改动时的约束

1. 先确认改动是角色、资金、升级还是订单价差问题
2. 同时检查路由、服务、后台页、小程序邀约页是否都需要同步
3. 如果改动会影响业务口径，还要同步更新 `docs/architecture/项目业务总览.md`
