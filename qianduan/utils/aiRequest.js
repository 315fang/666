/**
 * AI请求工具
 * 封装所有AI相关的API调用
 */

const request = require('./request');

/**
 * 检查AI服务健康状态
 */
async function checkHealth() {
  try {
    const res = await request.get('/ai/health');
    return res.data;
  } catch (error) {
    console.error('AI健康检查失败:', error);
    throw error;
  }
}

/**
 * 获取AI能力列表
 */
async function getCapabilities() {
  try {
    const res = await request.get('/ai/capabilities');
    return res.data;
  } catch (error) {
    console.error('获取AI能力失败:', error);
    throw error;
  }
}

/**
 * AI对话
 * @param {Array} messages - 消息数组 [{role: 'user', content: '...'}]
 * @param {Object} options - 可选参数
 */
async function chat(messages, options = {}) {
  try {
    const res = await request.post('/ai/chat', {
      messages,
      options
    });
    return res.data;
  } catch (error) {
    console.error('AI对话失败:', error);
    throw error;
  }
}

/**
 * AI智能管理 - 核心功能
 * @param {String} instruction - 自然语言指令
 * @param {Object} context - 上下文信息
 */
async function manage(instruction, context = {}) {
  try {
    const res = await request.post('/ai/manage', {
      instruction,
      context
    });
    return res.data;
  } catch (error) {
    console.error('AI管理指令执行失败:', error);
    throw error;
  }
}

/**
 * 数据分析
 * @param {String} analysisType - 分析类型 (orders, users, products, commissions)
 * @param {Object} data - 待分析数据
 * @param {String} question - 分析问题
 */
async function analyze(analysisType, data, question) {
  try {
    const res = await request.post('/ai/analyze', {
      analysisType,
      data,
      question
    });
    return res.data;
  } catch (error) {
    console.error('数据分析失败:', error);
    throw error;
  }
}

/**
 * 智能推荐
 * @param {String} recommendType - 推荐类型 (products, agents, strategies)
 * @param {Object} context - 上下文信息
 */
async function recommend(recommendType, context) {
  try {
    const res = await request.post('/ai/recommend', {
      recommendType,
      context
    });
    return res.data;
  } catch (error) {
    console.error('智能推荐失败:', error);
    throw error;
  }
}

/**
 * 业务问答
 * @param {String} question - 用户问题
 * @param {Object} context - 上下文信息
 */
async function answer(question, context = {}) {
  try {
    const res = await request.post('/ai/answer', {
      question,
      context
    });
    return res.data;
  } catch (error) {
    console.error('业务问答失败:', error);
    throw error;
  }
}

/**
 * 异常检测
 * @param {String} anomalyType - 异常类型
 * @param {Object} data - 待检测数据
 */
async function detectAnomaly(anomalyType, data) {
  try {
    const res = await request.post('/ai/detect-anomaly', {
      anomalyType,
      data
    });
    return res.data;
  } catch (error) {
    console.error('异常检测失败:', error);
    throw error;
  }
}

/**
 * 生成报告
 * @param {String} reportType - 报告类型
 * @param {Object} data - 报告数据
 * @param {String} period - 报告周期
 */
async function generateReport(reportType, data, period) {
  try {
    const res = await request.post('/ai/generate-report', {
      reportType,
      data,
      period
    });
    return res.data;
  } catch (error) {
    console.error('报告生成失败:', error);
    throw error;
  }
}

/**
 * 带缓存的AI请求
 * 对于相同的指令，在缓存有效期内直接返回缓存结果
 */
const aiCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

async function cachedManage(instruction, context = {}) {
  const cacheKey = `${instruction}_${JSON.stringify(context)}`;
  
  // 检查缓存
  if (aiCache[cacheKey] && Date.now() - aiCache[cacheKey].timestamp < CACHE_TTL) {
    console.log('使用缓存的AI响应');
    return aiCache[cacheKey].data;
  }

  // 请求新数据
  const result = await manage(instruction, context);
  
  // 存入缓存
  aiCache[cacheKey] = {
    data: result,
    timestamp: Date.now()
  };

  return result;
}

/**
 * 清除AI缓存
 */
function clearCache() {
  Object.keys(aiCache).forEach(key => {
    delete aiCache[key];
  });
}

/**
 * 使用示例函数
 */
const examples = {
  // 示例1: 分析订单数据
  async analyzeOrders() {
    const result = await manage('分析最近7天的订单趋势');
    return result;
  },

  // 示例2: 检测异常
  async detectOrderAnomalies() {
    const result = await manage('检测今天是否有异常订单');
    return result;
  },

  // 示例3: 商品推荐
  async recommendProducts(userHistory) {
    const result = await recommend('products', {
      history: userHistory,
      preferences: { price_range: [50, 500] }
    });
    return result;
  },

  // 示例4: 业务问答
  async askQuestion(question) {
    const result = await answer(question);
    return result;
  },

  // 示例5: 生成报告
  async createReport(orderData) {
    const result = await generateReport('orders', orderData, 'weekly');
    return result;
  },

  // 示例6: 对话
  async chatWithAI(userMessage, conversationHistory = []) {
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    const result = await chat(messages);
    return result;
  }
};

module.exports = {
  checkHealth,
  getCapabilities,
  chat,
  manage,
  analyze,
  recommend,
  answer,
  detectAnomaly,
  generateReport,
  cachedManage,
  clearCache,
  examples
};
