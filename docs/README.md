# 文档入口

当前文档体系已经按“业务需求 -> 技术结构 -> 操作说明 -> 历史归档”重新收口。

## 当前最先读什么

### 业务需求文档

- [`architecture/项目业务总览.md`](./architecture/项目业务总览.md)
- [`业务规则.md`](./业务规则.md)

### 技术总览文档

- [`architecture/overview.md`](./architecture/overview.md)
- [`architecture/backend.md`](./architecture/backend.md)
- [`architecture/admin-ui.md`](./architecture/admin-ui.md)
- [`architecture/miniprogram.md`](./architecture/miniprogram.md)

### 基线与收口文档

- [`audit/2026-04-06-repo-audit.md`](./audit/2026-04-06-repo-audit.md)
- [`audit/2026-04-08-cloudbase-runtime-audit.md`](./audit/2026-04-08-cloudbase-runtime-audit.md)
- [`plans/2026-04-06-repo-closure-program.md`](./plans/2026-04-06-repo-closure-program.md)
- [`plans/2026-04-06-repo-closure-tasklist.md`](./plans/2026-04-06-repo-closure-tasklist.md)

## 真相源规则

- 运行行为以当前代码为准
- 业务边界与协作口径以 `docs/` 为准
- 若代码与文档冲突，应以较新的、已验证的一方为准，并在同轮同步另一侧
- 根目录保留的历史命名文档如果与本目录冲突，只视为兼容入口或历史材料，不再视为主规范

## 文档分层

- `architecture/`: 当前业务与技术主说明
- `rules/`: 当前仍生效的业务规则、文档治理和协作边界
- `guides/`: 开发、测试、部署、权限等操作说明
- `internals/`: 按专题拆开的深度梳理文档
- `audit/`: 审计和运行态核查结果
- `plans/`: 当前执行中的收口计划
- `release/`: 发布前检查与生产差距
- `archive/`: 不再作为当前实现依据的历史资料

## 推荐阅读顺序

1. [`architecture/项目业务总览.md`](./architecture/项目业务总览.md)
2. [`architecture/overview.md`](./architecture/overview.md)
3. [`architecture/backend.md`](./architecture/backend.md)
4. [`guides/local-development.md`](./guides/local-development.md)
5. [`guides/permissions.md`](./guides/permissions.md)
6. [`guides/testing.md`](./guides/testing.md)

## 说明

根目录的 `代理体系4.0-业务手册.md` 与 `N级别独立代理-实现方案.md` 已改为当前入口说明，用来兼容历史文件名；真正的主入口仍然是 `docs/`。
