# 仓库全面审计报告

日期：2026-04-06
范围：根目录、`docs/`、`backend/`、`admin-ui/`、`miniprogram/`
目标：给出项目当前真实状态、主要风险和可执行收口顺序

## 1. 审计结论

这个项目不是“纯垃圾”，但当前已经进入明显失控边缘。

它的真实状态是：

1. 业务能力已经做出来了，尤其后端基础设施和订单域拆分方向并不差。
2. 工程治理明显跟不上业务扩张，测试、权限、文档、仓库卫生都不再可信。
3. 如果继续在这个基础上堆新功能，维护成本和回归风险会快速上升。
4. 正确策略不是推倒重来，而是做一次全面收口，恢复项目可信度。

一句话判断：

- 业务实现能力：中上
- 工程治理能力：偏弱
- 当前可维护性：中低
- 当前最该做的事：停止无序扩张，优先收口

## 2. 当前真实状态

### 2.1 技术栈

- 后端：Node.js + Express + Sequelize + MySQL
- 管理端：Vue 3 + Vite + Pinia + Element Plus
- 小程序：微信原生小程序

### 2.2 可运行性

- `backend npm test` 已恢复为可信基线，当前结果为 `8 suites passed / 80 tests passed`
- `admin-ui npm run build` 可成功构建，但包体已经出现明显警告
- 小程序未做完整自动化验证，当前以代码抽查为主

### 2.3 项目整体判断

- 后端不是裸堆接口，存在安全、限流、健康检查、任务锁等工程意识
- 管理端和小程序功能面很广，但大文件和职责混叠问题严重
- 文档和仓库层面存在明显的历史污染、错误信息和重复信息

## 3. 一级问题

### P1. 文档不可信

问题：

- 根文档和真实实现不一致
- 存在与本项目完全无关的仓库说明
- `docs/` 内混有计划、修复日志、设计稿、截图、SQL、英文总结、阶段文档

证据：

- `README.md` 仍把管理端写成 React + Ant Design + Vuex
- `CLAUDE.md` 是另一个项目 “Antigravity Kit” 的说明
- `docs/` 下存在设计截图、设计稿、迁移 SQL、历史计划、审计报告、修复记录混放

风险：

- 新人、AI、自动化工具会被错误上下文误导
- 无法快速判断哪份文档是当前真相

### P1. 测试体系曾经不可信，现已完成首轮修复

问题：

- 后端测试配置使用 Jest
- 部分测试文件使用 `node:test`
- 实际执行结果显示断言通过但 suite 失败

证据：

- `backend/jest.config.js`
- `backend/__tests__/services/PricingService.test.js`
- `backend/__tests__/services/OrderNumberService.test.js`

修复结果：

- 已将混用 `node:test` 的服务测试切回 Jest 语义
- 当前 `backend npm test` 结果为 `8 suites passed / 80 tests passed`

剩余风险：

- 测试覆盖面仍偏窄，当前只解决了“测试命令不可信”，还没解决“关键链路覆盖不够”

### P1. 权限模型不是单一真相

问题：

- 前端路由、前端 store、后端权限目录、后端中间件之间存在权限命名漂移

证据：

- 管理端路由把“管理员与权限”页写成 `super_admin`
- 前端 store 对 `super_admin` 做特殊处理
- 后端权限目录存在 `admins`
- 后端中间件再做 alias 归一化

风险：

- 菜单展示、接口访问、角色授予三者可能不一致
- 权限改动需要多处同步，长期一定继续漂

### P1. 仓库卫生差

问题：

- 已跟踪文件中混入压缩包、数据库快照等不应长期纳入版本控制的内容
- 仓库存在工具目录、历史目录、临时目录、重复副本

证据：

- `backend/新建文件夹.rar`
- `backend/说明/s2b2c_db_20260208130840cz3dc.sql`
- 根目录存在 `.agent`、`.codebuddy`、`.cursor`、`.opencode`、`xiufu`、`.worktrees` 等目录

风险：

- 仓库体积、协作成本、误修改风险持续上升

## 4. 二级问题

### P2. 后端已开始拆分，但拆分未收尾

问题：

- 订单域已经从 `OrderCoreService` 向更细 service 拆分
- 但 `OrderCreationService`、`OrderPaymentService`、`orderController` 体量仍然偏大
- `orderController` 仍残留大量旧依赖和历史语义

证据：

- `backend/services/OrderCreationService.js`
- `backend/services/OrderPaymentService.js`
- `backend/controllers/orderController.js`

判断：

- 方向对
- 收尾差
- 继续硬堆会重新长成上帝模块

### P2. `server.js` 和后台路由入口职责过重

问题：

- `backend/server.js` 同时做配置检查、数据库初始化、任务注册、缓存连接、支付健康检查、服务启动
- `backend/routes/admin/index.js` 已经承担几乎所有后台域的聚合

证据：

- `backend/server.js`
- `backend/routes/admin/index.js`

风险：

- 改动影响面过大
- 排障成本高
- 领域边界继续模糊

进展：

- `backend/routes/admin/index.js` 已完成首轮按领域拆分
- 当前已抽出 `content.js`、`system.js`、`finance.js`、`organization.js`
- 路由入口已从全量堆叠收口为聚合层，但 `server.js` 仍未拆

### P2. 管理端和小程序存在多个超大文件

问题：

- 管理端大页已进入难维护区
- 小程序 `app.js` 和重页承担过多职责

典型文件：

- `admin-ui/src/views/activities/index.vue`
- `admin-ui/src/views/settings/index.vue`
- `admin-ui/src/views/users/index.vue`
- `miniprogram/app.js`
- `miniprogram/pages/user/user.js`
- `miniprogram/pages/category/category.js`
- `miniprogram/pages/order/confirm.js`

风险：

- 改一处牵一片
- 无法精准测试
- 页面和基础设施边界继续恶化

### P2. 小程序请求层过重

问题：

- 请求封装承担 URL 纠偏、防重复、重试、401、上传、拦截器、刷新队列等大量职责

证据：

- `miniprogram/utils/request.js`

风险：

- 后续业务逻辑容易继续塞进 transport 层
- 问题定位会越来越难

### P2. 管理端构建虽然成功，但包体已不健康

问题：

- 构建可以通过
- 但大 chunk 已明显超阈值

实测结果：

- `admin-ui npm run build` 成功
- `element-plus` chunk 约 728KB
- Vite 已提示 `>500kB` 警告

风险：

- 初始加载性能继续恶化
- 后续继续加功能会放大问题

## 5. 正向资产

项目里有一些明确应该保留的资产：

1. `backend/app.js` 的安全意识较完整
2. 订单域已经开始往 service 化、职责拆分方向推进
3. 管理端已模块化出部分 `api/modules/*`
4. 小程序请求层虽然过重，但至少已统一封装，没有到处散落裸请求
5. 管理端当前仍可构建，说明没有彻底烂到不可收拾

结论：

- 这是一个需要收口的项目，不是需要重写的项目

## 6. 收口目标

本次收口应达成以下结果：

1. 根目录和 `docs/` 只有一套可信入口文档
2. 测试、构建、运行命令具备真实可验证性
3. 权限目录、前端路由、接口要求完全一致
4. 仓库中不再混入明显污染物
5. 超大文件停止继续膨胀，并形成拆分顺序

## 7. 收口顺序

### 第一阶段：建立可信基线

目标：

- 让项目“现在到底是什么状态”先有一份可信描述

动作：

1. 保留本审计报告作为收口基线
2. 保留并完善 `docs/plans/2026-04-06-repo-closure-program.md`
3. 暂停继续新增无关文档和功能扩张

### 第二阶段：清理文档与仓库污染

目标：

- 先把“错误信息”和“脏东西”清掉

动作：

1. 重写根 `README.md`
2. 删除或重写 `CLAUDE.md`
3. 将历史阶段报告、修复日志、设计稿、截图、旧计划移入 `docs/archive/`
4. 清理被 Git 跟踪的 `.rar`、SQL 快照、日志等污染物
5. 建立新的文档结构

### 第三阶段：修复工程可信度

目标：

- 测试、权限、构建与命令体系恢复可信

动作：

1. 统一 backend 测试框架
2. 统一权限真相源
3. 对齐前后端权限名
4. 明确文档中的运行、构建、测试命令

### 第四阶段：结构收口

目标：

- 控制继续失控的趋势

动作：

1. 拆 `backend/routes/admin/index.js`
2. 清理 `backend/controllers/orderController.js`
3. 继续细拆订单主链路 service
4. 拆管理端超大页面
5. 拆小程序 `app.js` 和重页
6. 收紧小程序请求层职责

## 8. 文档重建建议

建议最终文档结构：

```text
docs/
  README.md
  architecture/
    overview.md
    backend.md
    admin-ui.md
    miniprogram.md
  guides/
    local-development.md
    testing.md
    deployment.md
    permissions.md
  audit/
    2026-04-06-repo-audit.md
  plans/
    2026-04-06-repo-closure-program.md
  archive/
    legacy-docs/
    old-plans/
    design-drafts/
    snapshots/
```

原则：

- `README.md` 只保留当前真相
- `architecture/` 讲结构，不讲阶段废话
- `guides/` 讲开发、测试、部署
- `audit/` 放正式审计结果
- `plans/` 放执行计划
- `archive/` 放历史资料，不作为日常入口

## 9. 立即动作建议

建议从以下顺序开始执行：

1. 重写 `README.md`
2. 删除或替换 `CLAUDE.md`
3. 归档 `docs/` 中的历史噪音文档
4. 清理已跟踪污染文件
5. 修 backend 测试框架冲突
6. 修权限命名漂移
7. 开始第一批结构拆分

## 10. 最终判断

当前项目最大的问题不是“代码完全不能跑”，而是“项目不再可信”。

本次收口的重点不是做漂亮重构，而是恢复四件事：

1. 可信文档
2. 可信测试
3. 可信权限
4. 可信仓库边界

这四件事恢复后，后续功能开发才有意义。
