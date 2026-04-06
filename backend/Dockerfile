# 使用轻量级的 Node.js 镜像，专门用于生产环境
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 先安装依赖（利用 Docker 缓存层加速构建）
COPY package*.json ./
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 暴露服务端口
EXPOSE 3000

# 启动命令
CMD ["node", "server.js"]
