# zz 项目

微信电商分销系统仓库，包含三个主要部分：

- `backend/`: 后端 API、业务服务、定时任务、后台接口
- `admin-ui/`: 管理后台，Vue 3 + Vite + Pinia + Element Plus
- `miniprogram/`: 微信原生小程序

## 当前状态

本仓库正在进行一次全面收口，目标不是新增功能，而是恢复项目可信度：

- 修正文档与真实实现不一致的问题
- 清理仓库中的历史污染与无效说明
- 统一测试、权限、构建、运行约定
- 为后续结构拆分建立基线

当前收口基线文档：

- 审计报告：[`docs/audit/2026-04-06-repo-audit.md`](/C:/Users/21963/WeChatProjects/zz/docs/audit/2026-04-06-repo-audit.md)
- 收口方案：[`docs/plans/2026-04-06-repo-closure-program.md`](/C:/Users/21963/WeChatProjects/zz/docs/plans/2026-04-06-repo-closure-program.md)
- 任务清单：[`docs/plans/2026-04-06-repo-closure-tasklist.md`](/C:/Users/21963/WeChatProjects/zz/docs/plans/2026-04-06-repo-closure-tasklist.md)

## 真实技术栈

### Backend

- Node.js
- Express
- Sequelize
- MySQL
- Jest（当前测试体系正在收口）

### Admin UI

- Vue 3
- Vite
- Pinia
- Element Plus

### Miniprogram

- 微信原生小程序

## 目录

```text
backend/
admin-ui/
miniprogram/
docs/
docker/
scripts/
```

说明：

- `docs/` 目前正在整理，部分历史资料会迁移到 `docs/archive/`
- 根目录下若存在工具目录、临时目录、历史目录，不应视为项目主结构的一部分

## 真相源与边界

当前项目的唯一有效说明入口是：

- 运行行为以代码为准
- 项目说明、流程、规则以 `docs/` 为准
- 若代码与文档冲突，以当前较新的、已验证的一方为准，并在同轮把另一侧同步更新

以下内容不再视为项目资产：

- `.agent/`
- `.opencode/`
- `.worktrees/`
- `skill/`
- 日志、压缩包、数据库快照、上传产物、本地工具缓存

这些目录和产物即使再次出现在工作区，也不应作为项目主入口或规范来源。

## 开发命令

### Backend

```powershell
cd backend
npm install
npm run dev
```

测试：

```powershell
cd backend
npm test
```

注意：

- 后端测试体系当前正在修复，详见审计报告

### Admin UI

```powershell
cd admin-ui
npm install
npm run dev
```

构建：

```powershell
cd admin-ui
npm run build
```

### Miniprogram

- 使用微信开发者工具打开 `miniprogram/`
- 小程序运行依赖本地环境配置与后端服务

## 当前工作原则

1. 以当前真实实现为准，不以旧文档自述为准。
2. 先修可信度问题，再做结构优化。
3. 权限、接口、路由、文档必须逐步收口到单一真相源。
4. 历史资料默认归档，不继续作为主入口说明。
5. 仓库默认只保留源码、配置、当前文档，不保留工具残留和运行产物。

## 下一步

当前优先级：

1. 维持当前收口基线，不让旧规则回流
2. 权限 alias 完成数据清理后再移除兼容层
3. 恢复业务开发
4. 将前端进一步健康化列入第二阶段，而不是继续无限打磨
