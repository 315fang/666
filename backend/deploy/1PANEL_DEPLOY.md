# 🚀 1Panel 面板部署后端教程（你的情况专用）

> 前提：你已有服务器 + 1Panel + 域名已备案 + MySQL 已建好
> 部署包已在桌面：`backend_deploy.zip`（0.6MB）

---

## 第一步：上传并解压代码

1. 打开 **1Panel 面板** → 左侧菜单「**文件**」

2. 进入 `/opt/` 目录（或你喜欢的目录）

3. 点击「**新建目录**」→ 输入 `s2b2c` → 确定

4. 进入 `/opt/s2b2c/` 目录

5. 点击「**上传**」→ 选择桌面的 `backend_deploy.zip` → 上传

6. 找到上传的 `backend_deploy.zip`，点击右边 **⋮** → 「**解压**」
   - 解压到：当前目录 `/opt/s2b2c/`
   - 点确定

7. 解压后你应该看到这些文件：
   ```
   /opt/s2b2c/
   ├── app.js
   ├── server.js
   ├── package.json
   ├── sync_db.js
   ├── config/
   ├── controllers/
   ├── models/
   ├── routes/
   ├── ...
   ```

---

## 第二步：用 1Panel 终端安装依赖

1. 1Panel 左侧菜单 →「**终端**」（或「主机」→「终端」）

2. 依次执行以下命令：

```bash
# 检查 Node.js 是否已安装
node -v
```

**如果显示 "command not found"**，先装 Node.js：
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```

**如果已有 Node.js**，继续：

```bash
# 安装 PM2（进程管理）
npm install -g pm2

# 进入项目目录
cd /opt/s2b2c

# 安装项目依赖
npm install --production

# 创建日志目录
mkdir -p logs
```

---

## 第三步：配置 .env 文件

在 1Panel 终端执行：

```bash
cd /opt/s2b2c
nano .env
```

粘贴以下内容（**改成你自己的信息**）：

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置（改成你 1Panel 里 MySQL 的信息）
DB_HOST=localhost
DB_PORT=3306
DB_NAME=s2b2c_db
DB_USER=s2b2c_user
DB_PASSWORD=你的MySQL密码

# 微信小程序配置
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序AppSecret

# JWT密钥（随便写一串复杂的）
JWT_SECRET=zz-s2b2c-jwt-2026-abcdef123456
JWT_EXPIRES_IN=7d

# 管理后台JWT密钥
ADMIN_JWT_SECRET=zz-admin-jwt-2026-xyz789000
ADMIN_JWT_EXPIRES_IN=8h

# 提现配置
MIN_WITHDRAWAL_AMOUNT=10
WITHDRAWAL_FEE_RATE=0.006
```

按 **Ctrl+O** 保存 → **回车确认** → **Ctrl+X** 退出

---

### 获取 MySQL 信息的方法：

1. 1Panel →「**数据库**」→ 找到你的 MySQL
2. 点进去看 **用户名、密码、数据库名**
3. 如果还没建数据库，点「**新建数据库**」：
   - 数据库名：`s2b2c_db`
   - 字符集：`utf8mb4`
   - 用户名：`s2b2c_user`
   - 密码：自己设一个

---

## 第四步：初始化数据库表

```bash
cd /opt/s2b2c

# 同步数据库（自动创建所有表）
node sync_db.js
```

看到 `Database sync completed` 就成功了。

```bash
# 创建管理后台的管理员账号
node scripts/create-admin.js
```

---

## 第五步：启动后端服务

```bash
cd /opt/s2b2c

# 用 PM2 启动
pm2 start server.js --name "s2b2c-api"

# 查看状态（显示 online 就是成功了）
pm2 status

# 查看日志确认没问题
pm2 logs s2b2c-api --lines 20

# 设置开机自启
pm2 save
pm2 startup
```

此时后端已经在 **3000 端口** 运行了。

---

## 第六步：用 1Panel 配置反向代理 + HTTPS

### 方法 A：用 1Panel 的「网站」功能（推荐）

1. 1Panel →「**网站**」→「**创建网站**」
2. 选择「**反向代理**」
3. 填写：
   - 主域名：`api.jxalk.cn`
   - 代理地址：`http://127.0.0.1:3000`
4. 点「确定」创建

5. 创建后，点这个网站进去 →「**HTTPS**」
6. 选择「**申请证书**」→ Let's Encrypt → 申请
7. 开启「**强制 HTTPS**」

### 方法 B：如果方法 A 不好使，手动配 Nginx

1. 1Panel →「**网站**」→ 找到 `api.jxalk.cn` → 点「**配置文件**」
2. 在 server 块里确保有这段：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_connect_timeout 60s;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    client_max_body_size 20m;
}
```

---

## 第七步：验证

浏览器打开：
```
https://api.jxalk.cn/health
```

看到 `{"status":"ok","timestamp":"..."}` = ✅ **部署成功！**

后台管理：
```
https://api.jxalk.cn/admin/
```

---

## 📌 以后更新代码怎么办？

1. 本地改完代码后，重新运行打包（或手动上传改过的文件）
2. 1Panel →「文件」→ 上传覆盖到 `/opt/s2b2c/`
3. 1Panel →「终端」执行：

```bash
cd /opt/s2b2c
npm install --production
node sync_db.js
pm2 restart s2b2c-api
```

完事！

---

## ❓ 常见问题

### 1Panel 终端里显示 "npm: command not found"
```bash
# 装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```

### 解压后文件在子目录里（backend/app.js 而不是 app.js）
```bash
# 移动到正确位置
mv /opt/s2b2c/backend/* /opt/s2b2c/
rmdir /opt/s2b2c/backend
```

### 数据库连接失败
在 1Panel →「数据库」里确认：
- MySQL 正在运行
- 数据库名、用户名、密码跟 .env 里一致
- 如果 1Panel 的 MySQL 是 Docker 版，DB_HOST 可能需要改成 Docker 容器名或 `172.17.0.1`

### 查看 1Panel MySQL 的 Docker 情况
```bash
docker ps | grep mysql
```
如果 MySQL 跑在 Docker 里：
```bash
# .env 里的 DB_HOST 改成
DB_HOST=172.17.0.1
# 或者用 Docker 网络名
DB_HOST=容器名
```

### 端口 3000 被占了
```bash
# 改 .env 里的 PORT=3001
# 然后 1Panel 反向代理地址也改成 http://127.0.0.1:3001
pm2 restart s2b2c-api
```
