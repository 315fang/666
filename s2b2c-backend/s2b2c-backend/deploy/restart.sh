#!/bin/bash
# ============================================
# 代码更新后快速重启脚本
# 在服务器上运行：bash /www/backend/deploy/restart.sh
# ============================================

echo "=== S2B2C 后端重启 ==="

cd /www/backend

echo "[1] 安装/更新依赖..."
npm install --production

echo "[2] 同步数据库（有新字段时自动添加）..."
node sync_db.js

echo "[3] 重启服务..."
pm2 restart s2b2c-api || pm2 start deploy/pm2.config.json

echo "[4] 查看状态..."
pm2 status

echo ""
echo "✅ 重启完成！"
echo "查看日志: pm2 logs s2b2c-api"
