# 后端增量包说明（上传服务器后操作）

本目录为**相对 `backend/` 根目录的路径镜像**，上传到服务器后，请**合并进你真实的后端目录**（例如 `/opt/zz/backend`），覆盖同名文件。

---

## 一、上传后合并方式（示例）

在服务器上（路径按你实际修改）：

```bash
# 假设压缩包解压到 /tmp/backend-patch，后端在 /opt/zz/backend
cd /opt/zz/backend
cp -r /tmp/backend-patch/migrations/* ./migrations/
cp -r /tmp/backend-patch/utils/* ./utils/
cp -r /tmp/backend-patch/models/* ./models/
cp -r /tmp/backend-patch/controllers/* ./controllers/
cp -r /tmp/backend-patch/services/* ./services/
cp ./routes/users.js ./routes/users.js.bak   # 可选：先备份
cp /tmp/backend-patch/routes/users.js ./routes/
cp /tmp/backend-patch/routes/cart.js ./routes/
cp /tmp/backend-patch/routes/activity.js ./routes/
cp /tmp/backend-patch/routes/admin/controllers/adminProductController.js ./routes/admin/controllers/
```

或用 `rsync`：

```bash
rsync -av /tmp/backend-patch/ /opt/zz/backend/
```

---

## 二、商城可见字段 `visible_in_mall`（推荐用 Node 脚本）

**不要用 bash 直接执行 `.sql` 文件**（会出现 `command not found`）。任选其一：

### 方式 A（推荐，可重复执行、列已存在会自动跳过）

```bash
cd /opt/zz/backend
node migrations/apply_visible_in_mall_column.js
# 或 npm run migrate:visible-in-mall
```

需当前目录有可用 `.env`（`DB_HOST` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` 等）。

### 方式 B（用 mysql 客户端执行 SQL 文件）

```bash
cd /opt/zz/backend
mysql -u你的用户 -p你的库名 < migrations/20260322_add_visible_in_mall_to_products.sql
```

- 会给 `products` 增加 `visible_in_mall`，**默认 1 = 商城可见**；老数据自动为 1。
- 若列已存在，方式 A 会跳过；方式 B 会报错，可忽略。

---

## 三、按需执行：收藏表（若尚未建表）

若接口 `GET/POST /api/user/favorites` 仍报 500 且提示表不存在，在**已配置好 `.env` 数据库**的 `backend` 目录执行：

```bash
cd /opt/zz/backend
node migrations/phase10_user_product_favorites.js
```

已建过 `user_product_favorites` 则**不要重复执行**。

---

## 四、是否还要跑别的 npm 脚本？

- **一般不用。** 本次增量主要是改 JS/SQL，没有新增必装的 npm 依赖时，**不必**为本次单独跑迁移脚本（除上面 `node phase10...` 与 SQL 外）。
- 若你同时改了 `package.json`，再在服务器执行：`npm install` 或 `npm ci`。

---

## 五、重启 Node 服务

合并文件并执行 SQL 后，**必须重启**后端进程，例如：

```bash
pm2 restart all
# 或
pm2 restart 你的应用名
```

---

## 六、本包大致包含的能力

| 模块 | 说明 |
|------|------|
| `visible_in_mall` | 商城列表/热门/榜单等过滤；活动专享仍可选用 |
| 收藏 | `favoriteController` + `UserFavorite` + `users` 路由 |
| 积分等级 | `PointService` 按累计积分校正 `level` |
| 限时活动下单 | `LimitedSpotService`、`OrderCoreService`、`ActivitySpotStock` |
| 购物袋文案 | `cartController`、`cart` 路由 |
| 管理端商品 | `adminProductController` 读写 `visible_in_mall` |

若你线上 `models/index.js` 与本地差异很大，合并时请**以服务器为准**，只把本地新增的模型注册与关联**手工补进**服务器版本，避免覆盖掉线上独有配置。

---

## 七、部署后自检建议

1. `GET /api/products` 能返回列表（且隐藏商品不应出现）。  
2. 打开一件「商城隐藏」商品的活动页/专享页仍能下单（若已配置）。  
3. `GET /api/user/favorites` 不再 500（表已建）。  
4. `GET /api/points/account` 等级与累计积分一致。
