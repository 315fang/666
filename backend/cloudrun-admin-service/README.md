# CloudRun Admin Service

首期 CloudRun 管理服务骨架，目标是把 `admin-ui` 从旧 MySQL/Express 后端里拆出一条可演进的 CloudBase 管理链路。

当前实现特点：

- 面向 CloudRun，监听 `PORT`
- 无 CloudBase 环境时默认从 `cloud-mp/mysql/jsonl` 读取迁移快照，方便本地联调
- 若 `cloud-mp/cloudbase-seed` 中存在标准化集合，默认优先读取标准化 seed
- 运行时写操作落到 `backend/cloudrun-admin-service/.runtime/overrides`
- `ADMIN_DATA_SOURCE=mysql` 时，核心集合会从原后端 MySQL / Sequelize 预加载到内存缓存，并异步回刷 MySQL
- 检测到 `ADMIN_CLOUDBASE_ENV_ID` 或函数运行时环境变量时，默认优先走 `cloudbase`
- 管理端登录、商品、分类、订单、素材、Banner、图文内容、基础配置、经营看板已具备首期接口
- 小程序用户身份与后台管理员身份分离

## 启动

```bash
cd /abs/path/to/backend/cloudrun-admin-service
node src/server.js
```

默认地址：

- `http://127.0.0.1:3200/health`
- `http://127.0.0.1:3200/admin/api/login`

## 环境变量

- `PORT`: 服务端口，默认 `3200`
- `ADMIN_JWT_SECRET`: 管理端 JWT 密钥
- `ADMIN_DATA_ROOT`: 数据目录，默认指向 `cloud-mp/mysql/jsonl`
- `ADMIN_NORMALIZED_DATA_ROOT`: 标准化 seed 目录，默认指向 `cloud-mp/cloudbase-seed`
- `ADMIN_PREFER_NORMALIZED_DATA`: 是否优先读取标准化 seed，默认 `true`
- `ADMIN_DATA_SOURCE`: 数据源模式；未显式指定时，检测到 CloudBase 环境则默认 `cloudbase`，否则默认 `filesystem`
- `ADMIN_SINGLETON_SOURCE`: 单例配置模式，默认 `filesystem`
- `ADMIN_MYSQL_HOST`: MySQL 主机
- `ADMIN_MYSQL_PORT`: MySQL 端口
- `ADMIN_MYSQL_USER`: MySQL 用户名
- `ADMIN_MYSQL_PASSWORD`: MySQL 密码
- `ADMIN_MYSQL_DATABASE`: MySQL 数据库名
- `ADMIN_CLOUDBASE_ENV_ID`: CloudBase 环境 ID；未显式指定时可回退读取 `TCB_ENV`
- `ADMIN_CLOUDBASE_REGION`: CloudBase 区域
- `ADMIN_CLOUDBASE_SECRET_ID`: CloudBase / 腾讯云 SecretId
- `ADMIN_CLOUDBASE_SECRET_KEY`: CloudBase / 腾讯云 SecretKey
- `ADMIN_UPLOAD_BASE_URL`: 上传资源前缀，未配置时使用当前服务 `/uploads`

## 同步标准化 Seed

若已经执行过：

```bash
node cloud-mp/scripts/normalize-cloudbase-data.js
```

可继续执行：

```bash
cd /abs/path/to/backend/cloudrun-admin-service
npm run sync-seed
```

这会把 `cloud-mp/cloudbase-seed` 中的标准化集合复制到 `.runtime/overrides`，用于后台服务本地联调。

## 数据源模式

### `filesystem`

- 继续使用 `mysql/jsonl` 和 `cloudbase-seed` 作为读取基线
- 写操作落到 `.runtime/overrides`
- 适合离线联调和没有数据库凭据的环境

### `mysql`

- 启动时通过原后端 Sequelize 模型预加载核心集合到内存缓存
- 写操作先改缓存，再异步回刷到 MySQL
- 适合接入真实主数据源

### `cloudbase`

- 当前已接入 CloudBase Node SDK 读取核心集合
- 本地运行时需要 `ADMIN_CLOUDBASE_ENV_ID + ADMIN_CLOUDBASE_SECRET_ID + ADMIN_CLOUDBASE_SECRET_KEY`
- 云函数 / 云托管运行时可直接利用 CloudBase 环境变量推导 env id
- 单例配置当前仍回落到本地 runtime 文件，不是纯云端持久化

## 健康检查

- `GET /health`
- `GET /admin/api/runtime/data-source`
- `GET /admin/api/debug/data-source`

健康检查会返回：

- 当前数据源描述
- 运行模式
- 是否已准备完成
- MySQL 连接或 CloudBase 连接的状态
- 若处于 `mysql` 模式，`warnings` 会显示当前库里缺表或字段不匹配的集合，方便做 schema drift 排查

## 当前定位

这是迁移期的 CloudRun 管理服务，不再继续扩展旧 `backend` 的 MySQL 控制器。
后续若接入 CloudBase Node SDK，可在当前数据仓储层之上替换为真实 CloudBase 读写。
