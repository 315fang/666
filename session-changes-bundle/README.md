# 会话改动导出包（2026-03 整理）

本文件夹收纳**本次对话中涉及的全部代码与迁移**，目录与仓库根目录一致：`patch-root/backend/...`、`patch-root/admin-ui/...`、`patch-root/miniprogram/...`。

## 包含内容摘要

| 类别 | 说明 |
|------|------|
| 管理员最后登录 IP | `clientIp.js`，登录写库与后台列表展示规范化 `::ffff:127.0.0.1` |
| 移除「配置键管理 / 数据库索引」管理端 | 删除路由与页面后的路由、权限、文案调整（见 `DELETED_FILES.txt`） |
| 小程序确认订单 | 配送方式置顶、快递说明文案 |
| 小程序商品详情 | 配送方式说明卡片、点击自提提示 |
| 购物袋 / 下单 SKU | `sku_id` 用 `NULL` 非 `0`，`skuId.js` 统一归一；`OrderCoreService`、`LimitedSpotService`、`Cart` 模型 |
| 限时专享 | 迁移 SQL `activity_spot_stock`（线上缺表时报错修复） |

## 使用前请先读

- **本包不包含**已从你主仓库删除的三个文件内容（若目标环境仍存在旧版，需按 `DELETED_FILES.txt` 手动删除，否则与当前 `admin/index.js` 引用的路由不一致）。
- 应用前建议 **`git commit` 或备份**，再覆盖或逐文件合并。

## 应用方式

### 方式 A：PowerShell 一键覆盖到仓库根目录

在**本文件夹的上一级**（即包含 `backend`、`admin-ui`、`miniprogram` 的 `zz` 根目录）执行：

```powershell
cd c:\Users\21963\WeChatProjects\zz
.\session-changes-bundle\scripts\apply-to-repo.ps1
```

默认会把 `patch-root` 内文件复制到当前目录。若仓库在别的路径：

```powershell
.\session-changes-bundle\scripts\apply-to-repo.ps1 -RepoRoot "D:\your\path\zz"
```

脚本会按 `DELETED_FILES.txt` **删除**已废弃的配置页相关文件（若存在）。

### 方式 B：手动

将 `patch-root` 下各目录**整块合并**到你的项目对应目录即可。

## 数据库与运维脚本

**推荐（与线上一致、用项目 `.env`）：** 在 **`backend` 目录**执行：

```powershell
cd backend
node migrations/apply_activity_spot_stock.js
```

会连接 `DB_NAME`（默认 `s2b2c_db`）并 `CREATE TABLE IF NOT EXISTS activity_spot_stock`。

纯 SQL 方式见 `scripts/run-sql-migrations.sql`，或仓库内 `backend/migrations/20260321_activity_spot_stock.sql`，例如：

```text
mysql -u用户 -p s2b2c_db < backend/migrations/20260321_activity_spot_stock.sql
```

## 部署后建议

1. **重启 Node 后端**（PM2 / 面板重启）。
2. **重新构建**管理端与上传小程序代码包（若有前端改动）。
3. 验证：**加购**、**限时专享**、**确认订单配送方式**、**管理员最后登录 IP**。

## 文件清单

见同目录 `FILE_MANIFEST.md`。
