# 使用轻量级的 Node.js 镜像，专门用于生产环境
# 构建上下文：项目根目录（docker build -f docker/Dockerfile .）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 先安装后端依赖（利用 Docker 缓存层加速构建）
COPY backend/package*.json ./
RUN npm ci --only=production

# 复制后端代码
COPY backend/ .

# 复制已构建好的管理后台前端（需要先在本地执行 cd admin-ui && npm run build）
COPY admin-ui/dist ./admin-ui/dist

# 暴露服务端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
