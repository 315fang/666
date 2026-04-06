# 仓库全面审计与收口方案

日期：2026-04-06
负责人：Codex
状态：进行中

## 0. 当前进展

截至 2026-04-06，已完成以下收口动作：

1. 重写根目录 `README.md`，替换失真的项目说明。
2. 替换与仓库无关的 `CLAUDE.md`。
3. 建立 `docs/README.md` 和 `docs/archive/README.md`，并归档历史噪音文档。
4. 统一后端测试框架到 Jest，可稳定执行 `backend npm test`。
5. 收口首批权限漂移，前端共享角色预设已替代多处本地硬编码。
6. 将 `backend/routes/admin/index.js` 按领域拆分为聚合入口，新增 `content.js`、`system.js`、`finance.js`、`organization.js`。

## 1. 目标

本次收口不以新增功能为目标，而以“恢复项目可信度”为目标。输出应满足以下要求：

1. 根目录与 `docs/` 只有一套可信入口文档。
2. 测试命令、构建命令、运行命令可被明确验证。
3. 权限、路由、接口、文档之间的约定一致。
4. 仓库中不再混入日志、压缩包、数据库快照、过期说明等污染物。
5. 对后端、管理端、小程序分别形成可执行的分阶段整改清单。

## 2. 审计范围

### 2.1 文档与仓库卫生

- 根目录文档：`README.md`、`CLAUDE.md`
- `docs/` 全量文档
- `.gitignore`、`backend/.gitignore`
- 已跟踪的大文件、日志、压缩包、SQL 快照
- 重复目录、临时副本、历史快照、设计草稿

### 2.2 后端与测试

- 入口与配置：`backend/app.js`、`backend/server.js`、`backend/config/*`
- 鉴权与权限：`backend/middleware/*`、`backend/config/adminPermissionCatalog.js`
- 订单主链路：`backend/controllers/orderController.js`、`backend/services/Order*`
- 测试体系：`backend/jest.config.js`、`backend/__tests__/*`

### 2.3 管理端与小程序

- 管理端入口、路由、权限、请求层
- 大页面与公共模块拆分状态
- 小程序请求层、登录态、个人中心与关键页面
- 构建结果与包体风险

## 3. 收口原则

1. 先纠正“错误信息”，再优化“糟糕结构”。
2. 先修“会误导协作”的问题，再修“代码不好看”的问题。
3. 删除前先判断是否有保留价值；有则归档，无则直接删。
4. 所有“真相”只保留一份来源，杜绝双份权限表、双份技术栈说明、双份流程文档。
5. 收口期间原则上冻结新增功能，除非是高优先级线上修复。

## 4. 分阶段方案

### Phase 0：建立基线

目标：搞清楚项目当前真实状态，而不是沿用旧说法。

动作：

1. 审计根目录、`docs/`、后端、管理端、小程序的真实技术栈与入口。
2. 跑后端测试、管理端构建，记录真实结果。
3. 输出一份“当前真实状态”摘要，作为新文档的来源。

交付物：

- 审计摘要
- 当前问题清单

### Phase 1：清理文档与仓库污染

目标：让仓库入口先干净、可信。

动作：

1. 删除明显错误且无保留价值的文档。
2. 将有历史价值但已过期的文档移入 `docs/archive/`。
3. 重写 `README.md`，只保留当前真实技术栈、目录结构、运行方式、开发约定。
4. 删除或重写与项目无关的 `CLAUDE.md`。
5. 从版本控制中移除压缩包、SQL 快照、日志、设计截图等不应长期跟踪的内容。

交付物：

- 新版 `README.md`
- 新版仓库说明文档
- 文档归档结构

### Phase 2：修复工程可信度

目标：让测试、权限、构建、命令体系可用。

动作：

1. 统一后端测试框架，禁止 `jest` 与 `node:test` 混用。
2. 统一权限来源，以后端权限目录为单一真相源。
3. 修正前端路由权限名、后端权限名、权限目录之间的漂移。
4. 校验构建、测试、运行命令并写入文档。

交付物：

- 可稳定执行的测试命令
- 权限对齐清单
- 工程命令说明

### Phase 3：结构收口

目标：控制继续失控的趋势。

动作：

1. 拆分超大文件与上帝模块。
2. 清理重构残留、无用导入、误导性注释。
3. 将路由、页面、业务服务按领域重组。

优先目标：

- `backend/routes/admin/index.js`
- `backend/controllers/orderController.js`
- `admin-ui/src/views/activities/index.vue`
- `miniprogram/pages/user/user.js`

交付物：

- 结构整改计划
- 第一批拆分任务清单

## 5. 文档重建建议

收口后建议保留如下结构：

```text
docs/
  README.md                     # 文档总入口
  architecture/
    overview.md
    backend.md
    admin-ui.md
    miniprogram.md
  guides/
    local-development.md
    deployment.md
    testing.md
    permissions.md
  audit/
    2026-04-06-repo-audit.md
  plans/
    2026-04-06-repo-closure-program.md
  archive/
    legacy-docs/
    old-plans/
    snapshots/
```

原则：

- `README.md` 只讲当前真相与入口。
- `architecture/` 讲系统结构，不写阶段性废话。
- `guides/` 讲怎么开发、测试、部署。
- `audit/` 放阶段性检查报告。
- `archive/` 放历史资料，默认不作为日常入口。

## 6. 当前已确认的高优先级问题

1. `README.md` 技术栈与实际代码不符。
2. `CLAUDE.md` 与当前项目无关。
3. 后端测试配置使用 Jest，但部分测试文件使用 `node:test`。
4. 前后端权限命名存在漂移。
5. 仓库中存在已跟踪的压缩包、数据库快照等污染物。
6. 管理端与小程序存在多个超大文件，结构继续恶化。

## 7. 立即执行顺序

1. 完成三条审计线取证并汇总。
2. 形成正式审计报告。
3. 删除/归档错误文档与污染文件。
4. 重写主入口文档。
5. 修测试体系与权限对齐。
6. 开始第一批结构拆分。
