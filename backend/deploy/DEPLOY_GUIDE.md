# 🚀 后端部署完整教程（保姆级）

> 你只需要一台云服务器（推荐腾讯云/阿里云 2核2G 就够用）

---

## 第一步：买服务器

推荐：
- **腾讯云**轻量应用服务器 2核2G，装 **Ubuntu 22.04** 系统
- **阿里云**ECS 也行

买好后你会拿到：
- 服务器公网IP（比如 `123.456.789.0`）
- 登录密码（你自己设的）

---

## 第二步：域名解析

你已经有域名 `api.jxalk.cn`，去你的域名控制台：

1. 添加一条 **A 记录**：
   - 主机记录：`api`
   - 记录值：**你的服务器公网IP**
   - TTL：默认

等 5 分钟生效。

---

## 第三步：连接服务器

### Windows 用户：
1. 打开 **PowerShell** 或 **Windows Terminal**
2. 输入：

```bash
ssh root@你的服务器IP
```

3. 输入密码，回车（密码不会显示，正常的）

### 如果嫌命令行麻烦：
下载 **FinalShell**（免费好用）：https://www.hostbuf.com/t/988.html
- 新建连接 → SSH → 填IP、用户名root、密码 → 连接

---

## 第四步：服务器初始化（复制粘贴运行）

连上服务器后，**一行一行复制粘贴执行**：

```bash
# 1. 更新系统
apt update && apt upgrade -y

# 2. 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 3. 确认版本
node -v
npm -v

# 4. 安装 MySQL 8.0
apt install -y mysql-server

# 5. 启动 MySQL
systemctl start mysql
systemctl enable mysql

# 6. 安装 nginx（用于反向代理+HTTPS）
apt install -y nginx

# 7. 安装 PM2（进程管理，让后端不掉线）
npm install -g pm2

# 8. 安装 certbot（免费HTTPS证书）
apt install -y certbot python3-certbot-nginx
```

---

## 第五步：配置 MySQL 数据库

```bash
# 进入 MySQL
mysql
```

在 MySQL 命令行里执行：

```sql
-- 创建数据库
CREATE DATABASE s2b2c_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（把 YourStrongPassword123! 改成你自己想的密码）
CREATE USER 's2b2c_user'@'localhost' IDENTIFIED BY 'YourStrongPassword123!';

-- 授权
GRANT ALL PRIVILEGES ON s2b2c_db.* TO 's2b2c_user'@'localhost';
FLUSH PRIVILEGES;

-- 退出 MySQL
EXIT;
```

**⚠️ 记住你设的密码，后面要用！**

---

## 第六步：上传后端代码到服务器

### 方法 A：用 FinalShell 直接拖拽（最简单）
1. FinalShell 连接服务器
2. 在服务器上创建目录：
```bash
mkdir -p /www/backend
```
3. 把本地 `backend` 文件夹里的**所有文件**拖到 FinalShell 右侧的 `/www/backend/` 目录

### 方法 B：用 scp 命令上传
在**本地 PowerShell**（不是服务器）执行：
```powershell
scp -r C:\Users\21963\WeChatProjects\zz\backend\* root@你的服务器IP:/www/backend/
```

---

## 第七步：服务器上配置后端

```bash
# 进入项目目录
cd /www/backend

# 安装依赖
npm install --production

# 创建环境配置文件
nano .env
```

**粘贴以下内容**（nano 编辑器：粘贴后按 Ctrl+O 保存，按 Ctrl+X 退出）：

```env
# 服务器配置
PORT=3000
NODE_ENV=production

# 数据库配置（密码改成你第五步设的）
DB_HOST=localhost
DB_PORT=3306
DB_NAME=s2b2c_db
DB_USER=s2b2c_user
DB_PASSWORD=YourStrongPassword123!

# 微信小程序配置（去微信公众平台拿）
WECHAT_APPID=你的小程序AppID
WECHAT_SECRET=你的小程序AppSecret

# JWT密钥（随便改成一串复杂字符串，越长越安全）
JWT_SECRET=zz-s2b2c-jwt-secret-2026-very-safe-key
JWT_EXPIRES_IN=7d

# 管理后台JWT密钥
ADMIN_JWT_SECRET=zz-admin-jwt-secret-2026-very-safe-key
ADMIN_JWT_EXPIRES_IN=8h

# 提现配置
MIN_WITHDRAWAL_AMOUNT=10
WITHDRAWAL_FEE_RATE=0.006
```

---

## 第八步：初始化数据库表

```bash
cd /www/backend

# 同步数据库（自动创建所有表）
node sync_db.js

# 创建管理员账号
node scripts/create-admin.js
```

看到 `Database sync completed` 就成功了。

---

## 第九步：用 PM2 启动后端

```bash
cd /www/backend

# 启动后端服务
pm2 start server.js --name "s2b2c-api"

# 查看运行状态
pm2 status

# 查看日志（看有没有报错）
pm2 logs s2b2c-api --lines 30

# 设置开机自启
pm2 save
pm2 startup
```

看到 `online` 就说明后端跑起来了！

---

## 第十步：配置 Nginx + HTTPS

```bash
# 创建 nginx 配置
nano /etc/nginx/sites-available/api.jxalk.cn
```

粘贴以下内容：

```nginx
server {
    listen 80;
    server_name api.jxalk.cn;

    # API 接口反向代理
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

保存后执行：

```bash
# 启用配置
ln -s /etc/nginx/sites-available/api.jxalk.cn /etc/nginx/sites-enabled/

# 测试配置是否正确
nginx -t

# 重启 nginx
systemctl restart nginx

# 申请免费 HTTPS 证书（自动配置）
certbot --nginx -d api.jxalk.cn
```

certbot 会问你邮箱，填一个就行。选 `2` 自动重定向到 HTTPS。

---

## 第十一步：验证部署成功

在浏览器打开：

```
https://api.jxalk.cn/health
```

看到 `{"status":"ok","timestamp":"..."}` 就说明**全部部署成功了！** 🎉

后台管理地址：
```
https://api.jxalk.cn/admin/
```

---

## 🔧 日常运维命令（收藏备用）

```bash
# 查看后端状态
pm2 status

# 查看实时日志
pm2 logs s2b2c-api

# 重启后端（改了代码后）
pm2 restart s2b2c-api

# 停止后端
pm2 stop s2b2c-api

# 更新代码后重启
cd /www/backend
npm install --production
pm2 restart s2b2c-api

# 同步数据库（加了新字段后）
cd /www/backend
node sync_db.js
pm2 restart s2b2c-api
```

---

## ❓ 常见问题

### Q: 数据库连接失败？
```bash
# 检查 MySQL 是否在运行
systemctl status mysql
# 重启
systemctl restart mysql
```

### Q: 小程序请求报错？
1. 确认域名已在微信公众平台「开发设置」→「服务器域名」中添加 `https://api.jxalk.cn`
2. 确认 HTTPS 证书正常（浏览器打开 https://api.jxalk.cn/health ）

### Q: 后端挂了？
```bash
pm2 logs s2b2c-api --lines 50  # 看最后50行日志找错误
pm2 restart s2b2c-api           # 重启试试
```

### Q: 怎么更新代码？
以后改了代码，用 FinalShell 把改过的文件拖到服务器对应位置覆盖，然后：
```bash
cd /www/backend
pm2 restart s2b2c-api
```
