# AI功能测试指南

## 快速测试步骤

### 1. 环境准备

确保已安装依赖：
```bash
cd backend
npm install
```

### 2. 配置AI服务

创建 `.env` 文件（如果还没有的话）：
```bash
cp .env.example .env
```

编辑 `.env`，添加AI配置（至少需要配置API密钥）：
```bash
AI_PROVIDER=qwen  # 或 openai, ernie
AI_API_KEY=your_api_key_here
```

### 3. 启动服务

```bash
npm run dev
```

### 4. 测试AI健康状态

```bash
curl http://localhost:3000/api/ai/health
```

预期响应：
```json
{
  "code": 0,
  "data": {
    "status": "healthy",
    "provider": "qwen",
    "model": "qwen-turbo",
    "responseTime": "fast"
  }
}
```

### 5. 获取JWT Token

首先需要登录获取token（使用现有的登录接口）：

```bash
# 微信登录或其他方式获取token
# 假设token为: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
TOKEN="your_jwt_token_here"
```

### 6. 测试AI对话

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请介绍一下这个系统"}
    ]
  }'
```

### 7. 测试AI智能管理（核心功能）

```bash
curl -X POST http://localhost:3000/api/ai/manage \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instruction": "分析最近7天的订单数据"
  }'
```

### 8. 测试业务问答

```bash
curl -X POST http://localhost:3000/api/ai/answer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "如何升级为代理商？"
  }'
```

### 9. 测试智能推荐

```bash
curl -X POST http://localhost:3000/api/ai/recommend \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recommendType": "products",
    "context": {
      "history": [],
      "preferences": {
        "price_range": [100, 500]
      }
    }
  }'
```

## 常见问题

### Q1: AI服务返回 "AI API密钥未配置"

**解决方案**:
1. 检查 `.env` 文件中的 `AI_API_KEY` 是否配置
2. 确认环境变量是否加载成功
3. 重启服务

### Q2: 请求返回 401 Unauthorized

**解决方案**:
1. 确认JWT token是否有效
2. 检查token是否在请求头中正确设置
3. 确认用户角色是否有权限使用AI功能

### Q3: AI响应很慢或超时

**解决方案**:
1. 检查网络连接
2. 如果使用OpenAI，考虑使用国内AI服务
3. 减少输入数据量
4. 检查AI服务商的服务状态

### Q4: 返回 "AI功能仅对代理商和管理员开放"

**解决方案**:
1. 确认当前用户的角色级别
2. 普通用户只能使用问答功能
3. 升级为代理商或联系管理员

## 性能测试

### 测试并发请求

使用 Apache Bench 或其他工具测试：

```bash
# 安装 ab (Apache Bench)
sudo apt-get install apache2-utils

# 测试100个并发请求
ab -n 100 -c 10 -H "Authorization: Bearer $TOKEN" \
   -T "application/json" \
   -p request.json \
   http://localhost:3000/api/ai/answer
```

其中 request.json:
```json
{"question": "系统有哪些功能？"}
```

### 监控AI调用

查看日志文件：
```bash
tail -f backend/logs/combined.log | grep "AI调用"
```

## 自动化测试脚本

创建测试脚本 `test-ai.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
TOKEN="your_jwt_token_here"

echo "1. 测试AI健康状态..."
curl -s "$BASE_URL/api/ai/health" | jq

echo -e "\n2. 测试AI能力列表..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/ai/capabilities" | jq

echo -e "\n3. 测试业务问答..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "如何升级为代理商？"}' \
  "$BASE_URL/api/ai/answer" | jq

echo -e "\n4. 测试AI管理..."
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"instruction": "分析最近的订单数据"}' \
  "$BASE_URL/api/ai/manage" | jq

echo -e "\n所有测试完成！"
```

运行测试：
```bash
chmod +x test-ai.sh
./test-ai.sh
```

## 前端测试

在微信开发者工具中：

1. 打开 `pages/ai-assistant/index` 页面（如果已创建）
2. 输入指令测试
3. 查看控制台日志
4. 验证响应结果

## 性能基准

预期性能指标：

| 操作 | 预期响应时间 | 说明 |
|------|-------------|------|
| 健康检查 | < 100ms | 不调用AI |
| 业务问答 | 2-5秒 | 取决于AI服务 |
| 数据分析 | 3-8秒 | 包含数据查询 |
| 智能管理 | 3-10秒 | 包含意图解析 |

## 成本监控

### 查看API调用统计

在AI服务商控制台查看：
- 调用次数
- Token消耗
- 费用统计

### 设置预算告警

建议在AI服务商控制台设置：
- 日消费告警: ¥50
- 月消费告警: ¥500

## 下一步

测试完成后：
1. 查看 `AI_INTEGRATION_README.md` 了解使用方法
2. 查看 `backend/AI_INTEGRATION_GUIDE.md` 了解详细API
3. 开始在业务中使用AI功能
4. 收集用户反馈持续优化

---

**测试清单**

- [ ] AI服务健康检查通过
- [ ] 能够获取JWT token
- [ ] AI对话功能正常
- [ ] AI管理指令执行成功
- [ ] 业务问答准确
- [ ] 智能推荐合理
- [ ] 权限控制有效
- [ ] 性能满足要求
- [ ] 日志记录完整
- [ ] 错误处理正确

全部完成后，AI功能即可正式使用！🎉
