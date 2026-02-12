# AI 功能集成文档

## 概述

本系统已集成强大的AI功能，支持通过自然语言与系统交互，实现智能数据分析、业务洞察、异常检测等功能。

### 核心特性

- 🤖 **智能对话**: 支持自然语言问答，了解系统功能和业务流程
- 📊 **数据分析**: AI驱动的数据深度分析，提供业务洞察
- 🎯 **智能推荐**: 基于用户行为的个性化推荐
- 🚨 **异常检测**: 自动识别订单、佣金、库存异常
- 📈 **报告生成**: 自动生成专业的业务分析报告
- 🔧 **系统管理**: 通过自然语言指令管理系统（管理员权限）

## 环境配置

### 1. 安装依赖

```bash
cd backend
npm install axios --save
```

### 2. 配置环境变量

编辑 `.env` 文件，添加AI配置：

```bash
# AI 提供商选择: openai | qwen | ernie
AI_PROVIDER=openai

# API 密钥（必填）
AI_API_KEY=your_api_key_here

# OpenAI 配置（使用OpenAI时）
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4

# 通义千问配置（使用通义千问时）
QWEN_API_BASE=https://dashscope.aliyuncs.com/api/v1
QWEN_MODEL=qwen-turbo

# 文心一言配置（使用文心一言时）
ERNIE_API_BASE=https://aip.baidubce.com/rpc/2.0/ai_custom/v1
ERNIE_MODEL=ernie-bot
```

### 3. 获取API密钥

#### OpenAI
1. 访问 https://platform.openai.com/
2. 注册/登录账号
3. 进入API Keys页面
4. 创建新的API密钥
5. 复制密钥到 `AI_API_KEY`

**国内用户**: 可使用API中转服务，设置 `OPENAI_API_BASE` 为中转地址

#### 通义千问（推荐国内用户）
1. 访问 https://dashscope.aliyun.com/
2. 注册/登录阿里云账号
3. 开通模型服务
4. 获取API-KEY
5. 复制密钥到 `AI_API_KEY`

#### 文心一言
1. 访问 https://cloud.baidu.com/product/wenxinworkshop
2. 注册/登录百度智能云
3. 创建应用
4. 获取API Key和Secret Key
5. 复制到配置文件

## API接口文档

### 基础URL

```
http://your-domain.com/api/ai
```

### 认证

所有AI接口都需要JWT认证，请在请求头中携带token：

```
Authorization: Bearer {your_jwt_token}
```

### 权限说明

- **普通用户**: 仅可使用基础问答功能
- **代理商/团长**: 可使用数据查询、分析、推荐功能
- **管理员**: 拥有全部AI功能权限，包括系统管理

---

## 1. 健康检查

检查AI服务是否正常运行。

**接口**: `GET /api/ai/health`

**权限**: 无需认证

**响应**:
```json
{
  "code": 0,
  "data": {
    "status": "healthy",
    "provider": "openai",
    "model": "gpt-4",
    "responseTime": "fast"
  }
}
```

---

## 2. 获取AI能力列表

获取当前AI系统支持的所有功能。

**接口**: `GET /api/ai/capabilities`

**权限**: 代理商及以上

**响应**:
```json
{
  "code": 0,
  "data": {
    "operations": [
      "query_data",
      "analyze_business",
      "generate_report",
      "detect_anomaly",
      "recommend",
      "optimize",
      "alert",
      "execute_query"
    ],
    "targets": ["orders", "users", "products", "commissions", "inventory"],
    "features": [
      "自然语言数据查询",
      "智能业务分析",
      "自动报告生成",
      "异常检测和告警",
      "智能推荐系统",
      "优化建议",
      "多维度数据洞察"
    ],
    "examples": [
      "分析最近7天的订单趋势",
      "检测异常的佣金记录",
      "推荐给用户适合的商品"
    ]
  }
}
```

---

## 3. AI对话

通用的AI对话接口，可以进行自然语言交互。

**接口**: `POST /api/ai/chat`

**权限**: 代理商及以上

**请求体**:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "如何升级为代理商？"
    }
  ],
  "options": {
    "temperature": 0.7,
    "maxTokens": 1500
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "content": "升级为代理商需要满足以下条件：\n1. 成为团长至少30天\n2. 累计邀请下级用户达到50人\n3. 个人月销售额达到10000元\n\n满足条件后，可以在个人中心申请升级，审核通过后即可成为代理商。",
    "role": "assistant",
    "usage": {
      "prompt_tokens": 45,
      "completion_tokens": 89,
      "total_tokens": 134
    }
  }
}
```

---

## 4. AI智能管理 ⭐核心功能

通过自然语言指令管理系统，查询数据、分析业务、生成报告等。

**接口**: `POST /api/ai/manage`

**权限**: 代理商及以上（管理员拥有更多权限）

**请求体**:
```json
{
  "instruction": "分析最近7天的订单数据，找出销售趋势",
  "context": {
    "additional_info": "重点关注退款率"
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "success": true,
    "instruction": "分析最近7天的订单数据，找出销售趋势",
    "intent": {
      "operation": "analyze_business",
      "target": "orders",
      "parameters": {
        "timeRange": "week"
      },
      "intent_description": "分析订单业务数据"
    },
    "result": {
      "data": [...],
      "count": 245,
      "target": "orders",
      "analysis": "根据最近7天的数据分析：\n\n1. **订单趋势**: 订单量呈上升趋势，周末订单量是工作日的1.5倍\n2. **客单价**: 平均客单价为158元，较上周提升8%\n3. **退款率**: 当前退款率为2.3%，处于正常范围\n4. **高峰时段**: 晚上8-10点是下单高峰期\n\n**建议**: \n- 周末加大促销力度\n- 优化晚间客服响应速度\n- 关注退款原因，持续改进"
    },
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

### 智能管理指令示例

#### 查询数据
```json
{
  "instruction": "查询今天的所有订单"
}
```

```json
{
  "instruction": "找出本月佣金超过1000元的代理商"
}
```

#### 业务分析
```json
{
  "instruction": "分析最近30天的用户增长情况"
}
```

```json
{
  "instruction": "对比本月和上月的商品销售数据"
}
```

#### 异常检测
```json
{
  "instruction": "检测是否有异常的订单"
}
```

```json
{
  "instruction": "找出库存异常的商品"
}
```

#### 生成报告
```json
{
  "instruction": "生成本周的业绩报告"
}
```

#### 智能推荐
```json
{
  "instruction": "推荐适合新用户购买的商品"
}
```

#### 优化建议
```json
{
  "instruction": "给出提升订单转化率的建议"
}
```

---

## 5. 数据分析

针对特定数据进行深度分析。

**接口**: `POST /api/ai/analyze`

**权限**: 代理商及以上

**请求体**:
```json
{
  "analysisType": "orders",
  "data": [
    {
      "id": 1,
      "total_amount": 299.00,
      "created_at": "2026-02-10T10:00:00Z"
    },
    ...
  ],
  "question": "这些订单有什么特点？"
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "analysis": "通过分析这批订单数据，发现以下特点：\n\n1. **订单金额分布**: 主要集中在200-500元区间\n2. **时间分布**: 工作日订单量较少，周末占比达60%\n3. **客户复购**: 有35%的订单来自老客户\n4. **支付方式**: 微信支付占95%\n\n建议重点关注周末的营销活动。",
    "type": "orders",
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

**支持的分析类型**:
- `orders`: 订单分析
- `users`: 用户分析
- `products`: 商品分析
- `commissions`: 佣金分析

---

## 6. 智能推荐

基于上下文信息进行智能推荐。

**接口**: `POST /api/ai/recommend`

**权限**: 所有认证用户

**请求体 - 商品推荐**:
```json
{
  "recommendType": "products",
  "context": {
    "history": [
      {"product_id": 1, "name": "商品A", "category": "电子产品"},
      {"product_id": 5, "name": "商品B", "category": "电子产品"}
    ],
    "preferences": {
      "price_range": [100, 500],
      "preferred_categories": ["电子产品", "家居"]
    }
  }
}
```

**请求体 - 代理商推荐**:
```json
{
  "recommendType": "agents",
  "context": {
    "stats": {
      "order_count": 25,
      "total_amount": 8500,
      "member_since_days": 90
    }
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "recommendation": "基于您的购买历史和偏好，推荐以下商品：\n\n1. **智能手表** - 与您之前购买的电子产品匹配\n2. **无线耳机** - 高性价比，符合您的预算\n3. **移动电源** - 实用配件，好评率98%\n\n这些商品都是当前热卖款，库存充足。",
    "type": "products",
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

---

## 7. 业务问答

针对系统业务的智能问答。

**接口**: `POST /api/ai/answer`

**权限**: 所有认证用户

**请求体**:
```json
{
  "question": "佣金什么时候可以提现？",
  "context": {
    "user_role": "agent"
  }
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "answer": "佣金提现规则如下：\n\n1. **冻结期**: 佣金需要冻结15天后才能提现\n2. **最低金额**: 单次提现最低10元\n3. **提现次数**: 每天最多提现3次\n4. **到账时间**: 工作日1-3小时到账，节假日可能延迟\n\n您可以在"我的钱包"页面查看可提现余额和提现记录。",
    "question": "佣金什么时候可以提现？",
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

---

## 8. 异常检测

检测数据中的异常模式。

**接口**: `POST /api/ai/detect-anomaly`

**权限**: 代理商及以上

**请求体**:
```json
{
  "anomalyType": "orders",
  "data": [
    {
      "id": 123,
      "total_amount": 9999.00,
      "buyer_id": 456,
      "ip_address": "192.168.1.1",
      "created_at": "2026-02-12T10:00:00Z"
    },
    ...
  ]
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "anomalies": "检测到以下异常：\n\n1. **高额订单异常** (严重程度: 高)\n   - 订单ID: 123\n   - 金额: 9999元，远超平均值\n   - 建议: 人工审核该订单\n\n2. **IP集中异常** (严重程度: 中)\n   - 同一IP短时间内下单5次\n   - 可能原因: 刷单或测试\n   - 建议: 核实订单真实性",
    "type": "orders",
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

---

## 9. 报告生成

自动生成专业的业务报告。

**接口**: `POST /api/ai/generate-report`

**权限**: 代理商及以上

**请求体**:
```json
{
  "reportType": "orders",
  "data": [...],
  "period": "monthly"
}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "report": "# 2026年2月订单业绩报告\n\n## 执行摘要\n\n本月订单总量2,456笔，环比增长18%...",
    "type": "orders",
    "period": "monthly",
    "timestamp": "2026-02-12T10:30:00.000Z"
  }
}
```

---

## 前端集成示例

### 创建AI请求工具

```javascript
// utils/aiRequest.js
const request = require('./request');

/**
 * AI对话
 */
async function chat(messages, options = {}) {
  return await request.post('/ai/chat', {
    messages,
    options
  });
}

/**
 * AI智能管理
 */
async function manage(instruction, context = {}) {
  return await request.post('/ai/manage', {
    instruction,
    context
  });
}

/**
 * 数据分析
 */
async function analyze(analysisType, data, question) {
  return await request.post('/ai/analyze', {
    analysisType,
    data,
    question
  });
}

/**
 * 智能推荐
 */
async function recommend(recommendType, context) {
  return await request.post('/ai/recommend', {
    recommendType,
    context
  });
}

/**
 * 业务问答
 */
async function answer(question, context = {}) {
  return await request.post('/ai/answer', {
    question,
    context
  });
}

module.exports = {
  chat,
  manage,
  analyze,
  recommend,
  answer
};
```

### 使用示例

```javascript
const aiRequest = require('../../utils/aiRequest');

Page({
  data: {
    aiResponse: ''
  },

  async onAskAI() {
    try {
      wx.showLoading({ title: 'AI思考中...' });

      const result = await aiRequest.manage(
        '分析我最近的订单数据'
      );

      this.setData({
        aiResponse: result.data.result.analysis
      });

      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({
        title: 'AI服务异常',
        icon: 'none'
      });
    }
  }
});
```

---

## 使用场景

### 1. 代理商数据分析
```javascript
const result = await aiRequest.manage(
  '分析我本月的销售业绩，给出提升建议'
);
```

### 2. 异常订单检测
```javascript
const result = await aiRequest.manage(
  '检测今天是否有异常订单'
);
```

### 3. 智能客服
```javascript
const answer = await aiRequest.answer(
  '如何邀请新用户加入我的团队？'
);
```

### 4. 商品推荐
```javascript
const recommendation = await aiRequest.recommend('products', {
  history: userPurchaseHistory,
  preferences: userPreferences
});
```

### 5. 库存优化
```javascript
const result = await aiRequest.manage(
  '哪些商品需要补货？给出补货建议'
);
```

---

## 性能优化

### 1. 请求频率限制
- 每个用户每分钟最多20次AI请求
- 超过限制返回 429 错误

### 2. 缓存策略
对于重复查询，建议在前端实现缓存：

```javascript
const cache = {};

async function cachedAIRequest(instruction) {
  if (cache[instruction]) {
    return cache[instruction];
  }
  
  const result = await aiRequest.manage(instruction);
  cache[instruction] = result;
  
  // 5分钟后清除缓存
  setTimeout(() => {
    delete cache[instruction];
  }, 5 * 60 * 1000);
  
  return result;
}
```

### 3. 超时处理
AI请求可能需要较长时间，建议设置合理的超时时间：

```javascript
const result = await Promise.race([
  aiRequest.manage(instruction),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('请求超时')), 30000)
  )
]);
```

---

## 安全建议

1. **永远不要在前端暴露API密钥**
2. **所有AI请求必须经过后端认证**
3. **对敏感数据进行脱敏处理**
4. **记录所有AI操作日志**
5. **定期审查AI使用情况**

---

## 故障排查

### 问题：AI服务不可用

**检查清单**:
1. 环境变量 `AI_API_KEY` 是否配置
2. API密钥是否有效
3. 网络是否能访问AI服务商
4. 查看后端日志 `logs/error.log`

### 问题：请求超时

**解决方案**:
1. 减少数据量
2. 使用更简洁的指令
3. 调整超时时间设置
4. 检查API服务商状态

### 问题：返回结果不准确

**解决方案**:
1. 提供更详细的上下文信息
2. 使用更精确的指令描述
3. 调整 temperature 参数（降低随机性）
4. 尝试不同的模型

---

## 成本控制

### Token计费说明

不同AI提供商的计费方式：

| 提供商 | 输入价格 | 输出价格 |
|--------|---------|---------|
| OpenAI GPT-4 | $0.03/1K tokens | $0.06/1K tokens |
| 通义千问 | ¥0.008/1K tokens | ¥0.02/1K tokens |
| 文心一言 | ¥0.012/1K tokens | ¥0.012/1K tokens |

### 成本优化建议

1. **选择合适的模型**: 简单任务使用便宜模型
2. **控制token数量**: 限制输入输出长度
3. **实现缓存机制**: 避免重复请求
4. **监控使用量**: 设置预算告警

---

## 更新日志

### v1.0.0 (2026-02-12)
- ✨ 初始版本发布
- ✅ 支持 OpenAI、通义千问、文心一言
- ✅ 智能管理、数据分析、推荐系统
- ✅ 异常检测、报告生成
- ✅ 完整的权限控制和安全机制

---

## 技术支持

如有问题，请：
1. 查看本文档
2. 检查系统日志
3. 提交 GitHub Issue
4. 联系技术支持团队

---

**Built with AI & ❤️**
