#!/bin/bash
# ============================================
# 服务器一键初始化脚本
# 在服务器上运行：bash setup_server.sh
# ============================================

set -e
echo ""
echo "========================================"
echo "  S2B2C 后端服务器一键初始化"
echo "========================================"
echo ""

# ---------- 1. 系统更新 ----------
echo "[1/7] 更新系统..."
apt update && apt upgrade -y

# ---------- 2. 安装 Node.js 18 ----------
echo "[2/7] 安装 Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi
echo "Node.js 版本: $(node -v)"
echo "npm 版本: $(npm -v)"

# ---------- 3. 安装 MySQL ----------
echo "[3/7] 安装 MySQL..."
if ! command -v mysql &> /dev/null; then
    apt install -y mysql-server
    systemctl start mysql
    systemctl enable mysql
fi
echo "MySQL 已安装"

# ---------- 4. 安装 Nginx ----------
echo "[4/7] 安装 Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl start nginx
    systemctl enable nginx
fi
echo "Nginx 已安装"

# ---------- 5. 安装 PM2 ----------
echo "[5/7] 安装 PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi
echo "PM2 已安装"

# ---------- 6. 安装 Certbot ----------
echo "[6/7] 安装 Certbot (HTTPS证书)..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
fi
echo "Certbot 已安装"

# ---------- 7. 创建项目目录 ----------
echo "[7/7] 创建项目目录..."
mkdir -p /www/backend

echo ""
echo "========================================"
echo "  ✅ 环境安装完成！"
echo "========================================"
echo ""
echo "接下来你需要手动完成："
echo ""
echo "1. 配置 MySQL 数据库："
echo "   mysql"
echo "   > CREATE DATABASE s2b2c_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "   > CREATE USER 's2b2c_user'@'localhost' IDENTIFIED BY '你的密码';"
echo "   > GRANT ALL PRIVILEGES ON s2b2c_db.* TO 's2b2c_user'@'localhost';"
echo "   > FLUSH PRIVILEGES;"
echo "   > EXIT;"
echo ""
echo "2. 上传代码到 /www/backend/"
echo ""
echo "3. 配置 .env 文件：cd /www/backend && nano .env"
echo ""
echo "4. 安装依赖：cd /www/backend && npm install --production"
echo ""
echo "5. 同步数据库：node sync_db.js"
echo ""
echo "6. 启动服务：pm2 start server.js --name s2b2c-api"
echo ""
echo "详细步骤参考: deploy/DEPLOY_GUIDE.md"
echo ""
