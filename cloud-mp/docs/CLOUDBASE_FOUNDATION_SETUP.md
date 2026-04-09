# CloudBase Foundation Setup

## 目的

这份文档只描述基础工程，不讨论后续业务细节。

目标是先把下面这些基础件稳定下来：

- CloudBase skill
- CloudBase MCP 配置
- 小程序云函数目录
- 标准化 seed
- CloudBase 导入包
- 后台 CloudRun 基础服务

## 当前基础工程组成

### 1. CloudBase skill

- 安装路径：
  [C:\Users\21963\WeChatProjects\zz\cloud-mp\.agents\skills\cloudbase](C:\Users\21963\WeChatProjects\zz\cloud-mp\.agents\skills\cloudbase)

### 2. CloudBase MCP

- 配置文件：
  [C:\Users\21963\WeChatProjects\zz\config\mcporter.json](C:\Users\21963\WeChatProjects\zz\config\mcporter.json)

### 3. 小程序工程

- 入口配置：
  [C:\Users\21963\WeChatProjects\zz\cloud-mp\project.config.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\project.config.json)
- 云函数目录：
  [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions)

### 4. 数据迁移中间层

- 标准化 seed：
  [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed)
- CloudBase 导入包：
  [C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import)

### 5. 后台基础服务

- CloudRun 服务：
  [C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service)

## 常用命令

在 [C:\Users\21963\WeChatProjects\zz\cloud-mp](C:\Users\21963\WeChatProjects\zz\cloud-mp) 下执行：

```powershell
npm run check:foundation
npm run seed:normalize
npm run seed:build-import
npm run seed:prepare
```

在 [C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service) 下执行：

```powershell
npm run sync-seed
node src/server.js
```

## 当前基础工程状态

- 小程序云函数核心链路已存在
- 标准化数据链路已存在
- CloudBase 导入包已存在
- 后台可优先读取标准化数据
- 正式 CloudBase 环境导入和正式支付还未完成
