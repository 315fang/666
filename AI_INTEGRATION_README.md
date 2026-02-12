# AI功能集成说明

## 🎯 概述

本次更新为系统集成了强大的AI功能，实现了您的需求：**通过API直接接入AI，并赋予其最大权限来管理系统**。

### 核心特性

1. **🤖 自然语言系统管理** - 通过简单的中文指令管理整个系统
2. **📊 智能数据分析** - AI自动分析订单、用户、商品、佣金等数据
3. **🔍 异常检测** - 自动识别订单异常、佣金异常、库存问题
4. **📈 智能报告生成** - 自动生成专业的业务分析报告
5. **💡 智能推荐** - 为用户推荐商品、为代理商推荐策略
6. **🎓 业务问答助手** - 回答关于系统功能和业务流程的问题

## 🚀 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 配置AI服务

编辑 `backend/.env` 文件，添加AI配置：

```bash
# 选择AI提供商: openai | qwen | ernie
AI_PROVIDER=qwen

# 配置API密钥
AI_API_KEY=your_api_key_here

# 通义千问配置（推荐国内用户使用）
QWEN_API_BASE=https://dashscope.aliyuncs.com/api/v1
QWEN_MODEL=qwen-turbo
```

### 3. 获取API密钥

#### 方案一：通义千问（阿里云）- 推荐国内用户 ⭐

1. 访问 https://dashscope.aliyun.com/
2. 注册/登录阿里云账号
3. 开通模型服务（每月有免费额度）
4. 获取API-KEY
5. 将密钥配置到 `.env` 文件

**优势**：
- ✅ 国内访问快速稳定
- ✅ 中文理解能力强
- ✅ 价格便宜（¥0.008/千tokens）
- ✅ 每月有免费额度

#### 方案二：OpenAI

1. 访问 https://platform.openai.com/
2. 注册账号并充值
3. 创建API密钥
4. 配置到 `.env`

**注意**：国内需要使用代理或API中转服务

#### 方案三：文心一言（百度）

1. 访问 https://cloud.baidu.com/product/wenxinworkshop
2. 注册百度智能云账号
3. 创建应用获取密钥

### 4. 启动服务

```bash
cd backend
npm run dev
```

服务启动后，AI功能即可使用！

## 💻 使用示例

### 在小程序前端使用

```javascript
const aiRequest = require('../../utils/aiRequest');

Page({
  data: {
    aiResponse: ''
  },

  // 示例1: 分析订单数据
  async analyzeOrders() {
    try {
      wx.showLoading({ title: 'AI分析中...' });
      
      const result = await aiRequest.manage(
        '分析我最近7天的订单数据，找出销售趋势'
      );
      
      this.setData({
        aiResponse: result.result.analysis
      });
      
      wx.hideLoading();
      wx.showToast({ title: '分析完成', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '分析失败', icon: 'none' });
    }
  },

  // 示例2: 检测异常订单
  async detectAnomalies() {
    const result = await aiRequest.manage(
      '检测今天是否有异常的订单'
    );
    console.log(result.result.anomalies);
  },

  // 示例3: 业务问答
  async askQuestion() {
    const result = await aiRequest.answer(
      '如何升级为代理商？需要什么条件？'
    );
    console.log(result.answer);
  },

  // 示例4: 商品推荐
  async getRecommendations() {
    const result = await aiRequest.recommend('products', {
      history: this.data.purchaseHistory,
      preferences: { price_range: [100, 500] }
    });
    console.log(result.recommendation);
  }
});
```

### 通过HTTP API直接调用

```bash
# 健康检查
curl http://localhost:3000/api/ai/health

# AI管理指令（需要token）
curl -X POST http://localhost:3000/api/ai/manage \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "instruction": "分析最近7天的订单趋势"
  }'

# 业务问答
curl -X POST http://localhost:3000/api/ai/answer \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "佣金什么时候可以提现？"
  }'
```

## 📖 AI能力说明

### 1. 自然语言系统管理（核心功能）

通过自然语言指令管理系统，AI会自动理解意图并执行相应操作。

**支持的指令示例**：

#### 数据查询
```
"查询今天的所有订单"
"找出本月佣金超过1000元的代理商"
"显示库存低于10的商品"
```

#### 业务分析
```
"分析最近30天的用户增长情况"
"对比本月和上月的商品销售数据"
"分析哪些商品最受欢迎"
```

#### 异常检测
```
"检测是否有异常的订单"
"找出佣金异常的记录"
"检查库存异常的商品"
```

#### 报告生成
```
"生成本周的业绩报告"
"生成本月的佣金发放报告"
"生成商品销售分析报告"
```

#### 智能推荐
```
"推荐适合新用户购买的商品"
"给出提升销售额的建议"
"推荐哪些用户适合升级为代理商"
```

#### 优化建议
```
"如何提升订单转化率？"
"优化库存管理的建议"
"如何减少退款率？"
```

### 2. 权限控制

不同角色有不同的AI功能权限：

| 角色 | 可用功能 |
|------|---------|
| 普通用户 | 业务问答 |
| 会员 | 业务问答 |
| 团长 | 业务问答、数据查询、商品推荐 |
| 代理商 | 业务问答、数据查询、分析、推荐、异常检测 |
| 管理员 | 全部功能（包括系统管理、报告生成） |

### 3. 安全机制

- ✅ JWT认证保护所有AI接口
- ✅ 基于角色的权限控制
- ✅ 请求频率限制（20次/分钟）
- ✅ 敏感数据自动脱敏
- ✅ 完整的操作日志记录

## 🎨 实际应用场景

### 场景1: 代理商分析自己的业绩

```javascript
// 代理商可以这样使用
const result = await aiRequest.manage(
  '分析我本月的销售业绩，并给出提升建议'
);

// AI会返回类似这样的分析：
// "本月销售分析：
//  1. 总订单量：156笔，环比增长23%
//  2. 销售额：¥45,680，环比增长18%
//  3. 客单价：¥293，环比下降4%
//  
//  提升建议：
//  - 客单价有所下降，建议推荐高价值商品组合
//  - 周末订单量占比65%，建议工作日增加促销活动
//  - 复购率32%，可通过会员积分提升至40%"
```

### 场景2: 管理员检测异常订单

```javascript
const result = await aiRequest.manage(
  '检测今天是否有异常的订单，重点关注高额订单和刷单行为'
);

// AI会识别并报告：
// "发现以下异常：
//  
//  1. 高额订单异常（严重）
//     - 订单 #12345，金额 ¥9,999
//     - 新用户首单，异常高
//     - 建议：人工审核
//  
//  2. IP集中异常（中等）
//     - IP 192.168.1.1 短时间内下单5次
//     - 可能是刷单行为
//     - 建议：核实订单真实性"
```

### 场景3: 智能客服

```javascript
const result = await aiRequest.answer(
  '我想成为代理商，需要什么条件？云库存是怎么回事？'
);

// AI回答：
// "成为代理商需要满足以下条件：
//  1. 先成为团长，并保持团长身份至少30天
//  2. 累计邀请下级用户达到50人
//  3. 个人月销售额达到10000元
//  
//  云库存是代理商专属功能：
//  - 可以提前采购商品到云库存
//  - 客户下单后从云库存直接发货
//  - 享受更低的批发价格
//  - 可以管理库存进销存记录
//  
//  满足条件后，在个人中心申请升级即可。"
```

### 场景4: 商品推荐

```javascript
// 根据用户购买历史推荐商品
const result = await aiRequest.recommend('products', {
  history: [
    { product_id: 1, name: '智能手表', category: '电子产品' },
    { product_id: 5, name: '蓝牙耳机', category: '电子产品' }
  ],
  preferences: {
    price_range: [100, 500]
  }
});

// AI推荐：
// "基于您的购买历史，为您推荐：
//  
//  1. 智能手环（¥299）
//     - 与您的智能手表完美配对
//     - 健康监测功能更全面
//     - 当前销量TOP3
//  
//  2. 移动电源（¥168）
//     - 电子产品必备配件
//     - 20000mAh大容量
//     - 支持快充
//  
//  3. 手机支架（¥89）
//     - 高性价比实用产品
//     - 与您的价格预期匹配"
```

## 📊 API端点列表

| 端点 | 方法 | 功能 | 权限 |
|------|------|------|------|
| /api/ai/health | GET | 健康检查 | 无 |
| /api/ai/capabilities | GET | 获取能力列表 | 代理商+ |
| /api/ai/chat | POST | AI对话 | 代理商+ |
| /api/ai/manage | POST | 智能管理（核心） | 代理商+ |
| /api/ai/analyze | POST | 数据分析 | 代理商+ |
| /api/ai/recommend | POST | 智能推荐 | 所有用户 |
| /api/ai/answer | POST | 业务问答 | 所有用户 |
| /api/ai/detect-anomaly | POST | 异常检测 | 代理商+ |
| /api/ai/generate-report | POST | 报告生成 | 代理商+ |

详细的API文档请查看 `backend/AI_INTEGRATION_GUIDE.md`

## 💰 成本说明

### 通义千问（推荐）

| 模型 | 输入价格 | 输出价格 | 免费额度 |
|------|---------|---------|---------|
| qwen-turbo | ¥0.008/千tokens | ¥0.02/千tokens | 100万tokens/月 |
| qwen-plus | ¥0.04/千tokens | ¥0.12/千tokens | - |

**估算**：
- 一次普通对话约 500 tokens
- 一次数据分析约 2000 tokens
- 100万免费tokens ≈ 约2000次普通对话或500次数据分析

### 成本控制

系统内置多种成本控制机制：

1. **请求频率限制** - 防止过度调用
2. **缓存机制** - 相同查询使用缓存结果
3. **Token优化** - 自动精简输入输出
4. **权限控制** - 限制普通用户使用频率

## 🔧 高级配置

### 自定义系统提示词

可以在 `AIService.js` 中修改系统提示词，定制AI的行为：

```javascript
// 修改分析系统提示词
getAnalysisSystemPrompt(analysisType) {
  const prompts = {
    orders: `你是专业的电商数据分析师...`, // 自定义
    // ...
  };
  return prompts[analysisType];
}
```

### 调整AI参数

```javascript
// 在调用时传入options参数
const result = await aiRequest.chat(messages, {
  temperature: 0.3,  // 0-1，越低越准确，越高越有创意
  maxTokens: 2000,   // 最大输出长度
  topP: 0.9          // 采样参数
});
```

### 使用不同模型

```env
# 高级模型（更准确但更贵）
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4

# 标准模型（平衡）
AI_PROVIDER=qwen
QWEN_MODEL=qwen-turbo

# 经济模型（便宜）
AI_PROVIDER=qwen
QWEN_MODEL=qwen-7b-chat
```

## 🐛 故障排查

### 问题1: AI服务不可用

**错误信息**: "AI API密钥未配置"

**解决方案**:
1. 检查 `.env` 文件中是否配置了 `AI_API_KEY`
2. 确认API密钥格式正确
3. 重启服务

### 问题2: 请求超时

**错误信息**: "AI调用失败" / 请求超时

**解决方案**:
1. 检查网络连接
2. 如果使用OpenAI，检查是否需要代理
3. 尝试使用国内AI服务（通义千问、文心一言）
4. 减少输入数据量

### 问题3: 返回结果不准确

**解决方案**:
1. 提供更详细的指令和上下文
2. 使用更高级的模型（如gpt-4）
3. 调整temperature参数（降低获得更准确结果）

### 问题4: 权限不足

**错误信息**: "AI功能仅对代理商和管理员开放"

**解决方案**:
1. 确认用户角色级别
2. 普通用户只能使用问答功能
3. 升级为代理商以使用完整功能

## 📚 学习资源

- [完整API文档](./backend/AI_INTEGRATION_GUIDE.md)
- [AI自动化集成计划](./AI_AUTOMATION_INTEGRATION_PLAN.md)
- [通义千问官方文档](https://help.aliyun.com/zh/dashscope/)
- [OpenAI API文档](https://platform.openai.com/docs)

## 🤝 技术支持

如有问题：
1. 查看 `backend/logs/error.log`
2. 查看本文档和API文档
3. 提交GitHub Issue
4. 联系技术支持

## 🎉 总结

您现在拥有了一个强大的AI助手！它可以：

✅ 通过自然语言管理整个系统
✅ 自动分析业务数据并给出洞察
✅ 检测异常并及时告警
✅ 为用户提供智能推荐
✅ 回答各种业务问题
✅ 生成专业的分析报告

这正是您想要的 - **直接接入AI API，给予最大权限，让AI来管理系统！**

开始使用吧！🚀

---

**版本**: v1.0.0  
**更新日期**: 2026-02-12  
**作者**: Claude AI & 315fang
