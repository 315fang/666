/**
 * AI服务 - 核心AI功能集成
 * 支持多种AI提供商 (OpenAI, 通义千问, 文心一言等)
 */

const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'openai'; // openai, qwen, ernie
    this.apiKey = process.env.AI_API_KEY;
    this.apiBase = this.getApiBase();
    this.model = this.getDefaultModel();
    
    if (!this.apiKey) {
      logger.warn('AI API密钥未配置，AI功能将不可用');
    }
  }

  /**
   * 获取API基础URL
   */
  getApiBase() {
    const bases = {
      openai: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      qwen: process.env.QWEN_API_BASE || 'https://dashscope.aliyuncs.com/api/v1',
      ernie: process.env.ERNIE_API_BASE || 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1'
    };
    return bases[this.provider] || bases.openai;
  }

  /**
   * 获取默认模型
   */
  getDefaultModel() {
    const models = {
      openai: process.env.OPENAI_MODEL || 'gpt-4',
      qwen: process.env.QWEN_MODEL || 'qwen-turbo',
      ernie: process.env.ERNIE_MODEL || 'ernie-bot'
    };
    return models[this.provider] || models.openai;
  }

  /**
   * 通用聊天补全接口
   * @param {Array} messages - 消息数组 [{role: 'user', content: '...'}]
   * @param {Object} options - 可选参数
   */
  async chat(messages, options = {}) {
    if (!this.apiKey) {
      throw new Error('AI API密钥未配置');
    }

    try {
      const response = await this.callProvider(messages, options);
      
      // 记录AI调用日志
      logger.info('AI调用成功', {
        provider: this.provider,
        model: options.model || this.model,
        messageCount: messages.length,
        tokensUsed: response.usage
      });

      return response;
    } catch (error) {
      logger.error('AI调用失败', {
        provider: this.provider,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 调用具体的AI提供商
   */
  async callProvider(messages, options) {
    switch (this.provider) {
      case 'openai':
        return await this.callOpenAI(messages, options);
      case 'qwen':
        return await this.callQwen(messages, options);
      case 'ernie':
        return await this.callErnie(messages, options);
      default:
        throw new Error(`不支持的AI提供商: ${this.provider}`);
    }
  }

  /**
   * 调用 OpenAI API
   */
  async callOpenAI(messages, options) {
    const response = await axios.post(
      `${this.apiBase}/chat/completions`,
      {
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        top_p: options.topP || 1,
        frequency_penalty: options.frequencyPenalty || 0,
        presence_penalty: options.presencePenalty || 0,
        ...options.extraParams
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: options.timeout || 60000
      }
    );

    return {
      content: response.data.choices[0].message.content,
      role: response.data.choices[0].message.role,
      finishReason: response.data.choices[0].finish_reason,
      usage: response.data.usage,
      raw: response.data
    };
  }

  /**
   * 调用通义千问API
   */
  async callQwen(messages, options) {
    const response = await axios.post(
      `${this.apiBase}/services/aigc/text-generation/generation`,
      {
        model: options.model || this.model,
        input: {
          messages: messages
        },
        parameters: {
          temperature: options.temperature || 0.7,
          top_p: options.topP || 1,
          max_tokens: options.maxTokens || 2000,
          ...options.extraParams
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: options.timeout || 60000
      }
    );

    const output = response.data.output;
    return {
      content: output.text,
      role: 'assistant',
      finishReason: output.finish_reason,
      usage: response.data.usage,
      raw: response.data
    };
  }

  /**
   * 调用文心一言API
   */
  async callErnie(messages, options) {
    const response = await axios.post(
      `${this.apiBase}/wenxinworkshop/chat/${options.model || this.model}`,
      {
        messages: messages,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 1,
        ...options.extraParams
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: options.timeout || 60000,
        params: {
          access_token: this.apiKey
        }
      }
    );

    return {
      content: response.data.result,
      role: 'assistant',
      finishReason: response.data.finish_reason,
      usage: response.data.usage,
      raw: response.data
    };
  }

  /**
   * 智能数据分析
   * @param {String} analysisType - 分析类型 (orders, users, products, commissions)
   * @param {Object} data - 待分析数据
   * @param {String} question - 分析问题
   */
  async analyzeData(analysisType, data, question) {
    const systemPrompt = this.getAnalysisSystemPrompt(analysisType);
    const userPrompt = this.formatDataForAnalysis(data, question);

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.chat(messages, {
      temperature: 0.3, // 降低温度以获得更准确的分析
      maxTokens: 3000
    });

    return {
      analysis: response.content,
      type: analysisType,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取分析系统提示词
   */
  getAnalysisSystemPrompt(analysisType) {
    const prompts = {
      orders: `你是一个专业的电商数据分析师，擅长分析订单数据。
请根据提供的订单数据，进行深入分析并提供：
1. 关键指标总结（订单量、销售额、转化率等）
2. 趋势分析和异常检测
3. 可行的业务建议
4. 风险预警（如果有）

请用专业但易懂的语言回答，使用具体数据支撑你的观点。`,

      users: `你是一个专业的用户增长分析师，擅长分析用户行为和生命周期。
请根据提供的用户数据，进行分析并提供：
1. 用户画像和分层
2. 活跃度和留存分析
3. 增长机会识别
4. 用户运营建议

请用数据驱动的方式给出具体建议。`,

      products: `你是一个专业的商品运营分析师。
请根据提供的商品数据，分析并提供：
1. 商品销售表现评估
2. 库存健康度分析
3. 定价策略建议
4. SKU优化建议

请给出可执行的运营建议。`,

      commissions: `你是一个专业的分销系统分析师。
请根据提供的佣金数据，分析并提供：
1. 佣金分配合理性评估
2. 分销效率分析
3. 代理商/团长业绩分析
4. 激励机制优化建议

请给出数据支持的建议。`
    };

    return prompts[analysisType] || prompts.orders;
  }

  /**
   * 格式化数据用于分析
   */
  formatDataForAnalysis(data, question) {
    const dataJson = JSON.stringify(data, null, 2);
    return `${question}\n\n数据如下：\n\`\`\`json\n${dataJson}\n\`\`\`\n\n请进行详细分析。`;
  }

  /**
   * 智能推荐系统
   * @param {String} recommendType - 推荐类型 (products, agents, strategies)
   * @param {Object} context - 上下文信息
   */
  async getRecommendation(recommendType, context) {
    const systemPrompt = `你是一个智能推荐系统，专门为S2B2C分销平台提供个性化推荐。`;
    
    let userPrompt = '';
    switch (recommendType) {
      case 'products':
        userPrompt = `基于用户的购买历史：${JSON.stringify(context.history)}
以及用户偏好：${JSON.stringify(context.preferences)}
请推荐5个最适合的商品，并说明推荐理由。`;
        break;
      
      case 'agents':
        userPrompt = `基于用户的订单频次和购买金额：${JSON.stringify(context.stats)}
判断该用户是否适合成为代理商，并给出理由和建议。`;
        break;
      
      case 'strategies':
        userPrompt = `基于当前业务数据：${JSON.stringify(context.businessData)}
推荐3-5个可以提升业绩的运营策略。`;
        break;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.chat(messages, {
      temperature: 0.7,
      maxTokens: 2000
    });

    return {
      recommendation: response.content,
      type: recommendType,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 业务问答助手
   * @param {String} question - 用户问题
   * @param {Object} context - 业务上下文
   */
  async answerBusinessQuestion(question, context = {}) {
    const systemPrompt = `你是"臻选商城"S2B2C数字化分销系统的智能助手。
你了解该系统的所有功能：
- 三级分销体系（会员、团长、代理商）
- 佣金计算和分配机制
- 云库存管理
- 订单履约流程
- 提现和结算规则

请用专业、友好的语气回答用户问题，提供准确的信息和操作指导。`;

    const contextInfo = Object.keys(context).length > 0 
      ? `\n\n当前上下文信息：\n${JSON.stringify(context, null, 2)}`
      : '';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question + contextInfo }
    ];

    const response = await this.chat(messages, {
      temperature: 0.7,
      maxTokens: 1500
    });

    return {
      answer: response.content,
      question: question,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 异常检测
   * @param {String} anomalyType - 异常类型 (orders, commissions, inventory)
   * @param {Object} data - 待检测数据
   */
  async detectAnomalies(anomalyType, data) {
    const systemPrompt = `你是一个专业的数据异常检测系统，擅长识别业务数据中的异常模式。
请分析数据，识别以下类型的异常：
1. 统计异常（显著偏离正常范围）
2. 模式异常（不符合业务逻辑）
3. 时序异常（趋势突变）
4. 关联异常（多个指标联动异常）

对每个发现的异常，请说明：
- 异常描述
- 严重程度（高/中/低）
- 可能原因
- 建议措施`;

    const userPrompt = `检测类型：${anomalyType}\n数据：\n${JSON.stringify(data, null, 2)}\n\n请进行异常检测。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.chat(messages, {
      temperature: 0.2, // 低温度保证准确性
      maxTokens: 2000
    });

    return {
      anomalies: response.content,
      type: anomalyType,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 生成业务报告
   * @param {String} reportType - 报告类型
   * @param {Object} data - 报告数据
   * @param {String} period - 报告周期
   */
  async generateReport(reportType, data, period) {
    const systemPrompt = `你是一个专业的商业报告撰写专家。
请根据提供的数据生成一份专业的${reportType}报告，包含：
1. 执行摘要
2. 关键指标分析
3. 趋势和洞察
4. 问题和风险
5. 行动建议

报告应该结构清晰、数据准确、建议可行。使用markdown格式输出。`;

    const userPrompt = `报告周期：${period}\n数据：\n${JSON.stringify(data, null, 2)}\n\n请生成报告。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const response = await this.chat(messages, {
      temperature: 0.5,
      maxTokens: 4000
    });

    return {
      report: response.content,
      type: reportType,
      period: period,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const testMessages = [
        { role: 'user', content: '请回复"OK"' }
      ];
      
      const response = await this.chat(testMessages, {
        maxTokens: 10,
        timeout: 5000
      });

      return {
        status: 'healthy',
        provider: this.provider,
        model: this.model,
        responseTime: response.usage?.total_tokens ? 'fast' : 'unknown'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.provider,
        error: error.message
      };
    }
  }
}

// 导出单例
module.exports = new AIService();
