# Runtime Notes

## 当前运行模式

后台服务当前支持三层数据来源优先级：

1. `.runtime/overrides/*.json`
2. `cloud-mp/cloudbase-seed/*.json`
3. `cloud-mp/mysql/jsonl/*.json`

这意味着：

- 本地联调时可以直接覆盖运行时数据
- 若已完成标准化 seed 生成，则后台优先读取标准模型
- 若标准化 seed 不存在，则回退到旧 MySQL 导出快照

## 数据源模式

### `filesystem`

- 读取 seed / jsonl
- 写入 `.runtime/overrides`
- 适合无数据库凭据的本地联调

### `mysql`

- 启动时通过原后端 Sequelize 模型预加载核心集合到内存缓存
- 写入后异步回刷 MySQL
- 适合接入真实主数据源
- 若 MySQL 表结构与当前服务预期不一致，健康检查会进入 `degraded`，并在 `warnings` 中列出缺表或字段不匹配项

### `cloudbase`

- 当前已接入 CloudBase Node SDK 读取核心集合
- 本地联调必须提供：
  - `ADMIN_CLOUDBASE_ENV_ID`
  - `ADMIN_CLOUDBASE_SECRET_ID`
  - `ADMIN_CLOUDBASE_SECRET_KEY`
- `getSingleton/saveSingleton` 仍走 runtime 文件 fallback
- 因此当前是“可推进联调的过渡态”，不是最终纯云端持久化

## 当前限制

- 仍未直接写入 CloudBase 正式环境
- 支付仍是迁移期模拟闭环
- CloudBase provider 已接 SDK，但单例配置尚未完全云端化
- MySQL provider 已可切换，但会显式暴露 schema drift 警告，不会假装结构完全一致

## 后续替换目标

- 将仓储层替换为 CloudBase 正式读写
- 保留标准化 seed 作为离线调试和回归数据
