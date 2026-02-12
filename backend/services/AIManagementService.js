/**
 * AI管理服务 - 提供AI对系统的高级管理能力
 * 允许AI通过自然语言指令管理系统各个模块
 */

const logger = require('../utils/logger');
const AIService = require('./AIService');
const { Order, User, Product, CommissionLog, StockTransaction } = require('../models');
const { Op } = require('sequelize');

class AIManagementService {
  constructor() {
    this.aiService = AIService;
    this.allowedOperations = [
      'query_data',      // 查询数据
      'analyze_business',// 业务分析
      'generate_report', // 生成报告
      'detect_anomaly',  // 异常检测
      'recommend',       // 智能推荐
      'optimize',        // 优化建议
      'alert',          // 告警管理
      'execute_query'   // 执行查询
    ];
  }

  /**
   * AI智能管理入口
   * @param {String} instruction - AI指令（自然语言）
   * @param {Object} context - 上下文信息
   * @param {Object} permissions - 权限配置
   */
  async executeInstruction(instruction, context = {}, permissions = {}) {
    try {
      logger.info('AI管理指令执行开始', { instruction, context });

      // 1. 理解指令意图
      const intent = await this.parseIntent(instruction, context);
      
      // 2. 验证权限
      if (!this.validatePermission(intent.operation, permissions)) {
        throw new Error(`权限不足：无法执行 ${intent.operation} 操作`);
      }

      // 3. 执行操作
      const result = await this.executeOperation(intent, context);

      // 4. 记录操作日志
      await this.logAIOperation(instruction, intent, result);

      return {
        success: true,
        instruction,
        intent,
        result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('AI管理指令执行失败', {
        instruction,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        instruction,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 解析AI指令意图
   */
  async parseIntent(instruction, context) {
    const systemPrompt = `你是一个智能指令解析器，负责将自然语言指令转换为结构化的操作。

支持的操作类型：
- query_data: 查询数据（订单、用户、商品、佣金等）
- analyze_business: 业务分析
- generate_report: 生成报告
- detect_anomaly: 异常检测
- recommend: 智能推荐
- optimize: 优化建议
- alert: 告警管理
- execute_query: 执行特定查询

请将用户指令解析为JSON格式：
{
  "operation": "操作类型",
  "target": "操作目标",
  "parameters": { "参数对象" },
  "intent_description": "意图描述"
}`;

    const contextInfo = Object.keys(context).length > 0 
      ? `\n当前上下文：${JSON.stringify(context)}`
      : '';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `指令：${instruction}${contextInfo}\n\n请解析为JSON格式。` }
    ];

    const response = await this.aiService.chat(messages, {
      temperature: 0.1,
      maxTokens: 500
    });

    try {
      // 提取JSON内容
      let jsonContent = response.content;
      const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonContent = jsonMatch[0];
      }
      
      const intent = JSON.parse(jsonContent);
      return intent;
    } catch (error) {
      logger.error('解析AI意图失败', { response: response.content, error: error.message });
      throw new Error('无法理解该指令，请使用更清晰的描述');
    }
  }

  /**
   * 验证操作权限
   */
  validatePermission(operation, permissions) {
    // 如果未提供权限配置，默认允许所有操作
    if (!permissions || Object.keys(permissions).length === 0) {
      return true;
    }

    // 检查是否在允许的操作列表中
    if (!this.allowedOperations.includes(operation)) {
      return false;
    }

    // 检查特定权限
    if (permissions.allowedOperations && Array.isArray(permissions.allowedOperations)) {
      return permissions.allowedOperations.includes(operation);
    }

    return true;
  }

  /**
   * 执行具体操作
   */
  async executeOperation(intent, context) {
    const { operation, target, parameters } = intent;

    switch (operation) {
      case 'query_data':
        return await this.queryData(target, parameters);
      
      case 'analyze_business':
        return await this.analyzeBusiness(target, parameters);
      
      case 'generate_report':
        return await this.generateReport(target, parameters);
      
      case 'detect_anomaly':
        return await this.detectAnomaly(target, parameters);
      
      case 'recommend':
        return await this.makeRecommendation(target, parameters);
      
      case 'optimize':
        return await this.provideOptimization(target, parameters);
      
      case 'alert':
        return await this.manageAlert(target, parameters);
      
      case 'execute_query':
        return await this.executeCustomQuery(target, parameters);
      
      default:
        throw new Error(`不支持的操作类型: ${operation}`);
    }
  }

  /**
   * 查询数据
   */
  async queryData(target, parameters) {
    const { timeRange, limit = 100, filters = {} } = parameters;

    let whereClause = {};
    
    // 处理时间范围
    if (timeRange) {
      const { start, end } = this.parseTimeRange(timeRange);
      whereClause.created_at = {
        [Op.between]: [start, end]
      };
    }

    // 处理其他过滤条件
    Object.assign(whereClause, filters);

    switch (target) {
      case 'orders':
        const orders = await Order.findAll({
          where: whereClause,
          limit,
          order: [['created_at', 'DESC']],
          include: [
            { model: User, as: 'buyer', attributes: ['id', 'nickname', 'role_level'] },
            { model: Product, attributes: ['id', 'name', 'retail_price'] }
          ]
        });
        return { data: orders, count: orders.length, target: 'orders' };

      case 'users':
        const users = await User.findAll({
          where: whereClause,
          limit,
          order: [['created_at', 'DESC']]
        });
        return { data: users, count: users.length, target: 'users' };

      case 'products':
        const products = await Product.findAll({
          where: whereClause,
          limit,
          order: [['created_at', 'DESC']]
        });
        return { data: products, count: products.length, target: 'products' };

      case 'commissions':
        const commissions = await CommissionLog.findAll({
          where: whereClause,
          limit,
          order: [['created_at', 'DESC']],
          include: [
            { model: User, as: 'user', attributes: ['id', 'nickname', 'role_level'] },
            { model: Order, attributes: ['id', 'order_number', 'total_amount'] }
          ]
        });
        return { data: commissions, count: commissions.length, target: 'commissions' };

      case 'inventory':
        const inventory = await StockTransaction.findAll({
          where: whereClause,
          limit,
          order: [['created_at', 'DESC']],
          include: [
            { model: User, attributes: ['id', 'nickname'] },
            { model: Product, attributes: ['id', 'name'] }
          ]
        });
        return { data: inventory, count: inventory.length, target: 'inventory' };

      default:
        throw new Error(`不支持的查询目标: ${target}`);
    }
  }

  /**
   * 业务分析
   */
  async analyzeBusiness(target, parameters) {
    // 获取数据
    const data = await this.queryData(target, parameters);
    
    // 使用AI进行分析
    const analysis = await this.aiService.analyzeData(
      target,
      data.data,
      parameters.question || `请分析这些${target}数据`
    );

    return {
      ...data,
      analysis: analysis.analysis
    };
  }

  /**
   * 生成报告
   */
  async generateReport(target, parameters) {
    const { period = 'daily', format = 'markdown' } = parameters;
    
    // 获取报告数据
    const data = await this.queryData(target, { 
      timeRange: period,
      ...parameters 
    });

    // 使用AI生成报告
    const report = await this.aiService.generateReport(
      target,
      data.data,
      period
    );

    return {
      report: report.report,
      data: data,
      format,
      period
    };
  }

  /**
   * 异常检测
   */
  async detectAnomaly(target, parameters) {
    // 获取数据
    const data = await this.queryData(target, parameters);

    // 使用AI检测异常
    const anomalies = await this.aiService.detectAnomalies(
      target,
      data.data
    );

    return {
      ...data,
      anomalies: anomalies.anomalies
    };
  }

  /**
   * 智能推荐
   */
  async makeRecommendation(target, parameters) {
    const recommendation = await this.aiService.getRecommendation(
      target,
      parameters
    );

    return recommendation;
  }

  /**
   * 优化建议
   */
  async provideOptimization(target, parameters) {
    // 获取当前数据
    const currentData = await this.queryData(target, parameters);

    // 使用AI分析并提供优化建议
    const systemPrompt = `你是一个业务优化专家，请根据当前${target}数据，提供具体的优化建议。
建议应该：
1. 可执行性强
2. 有明确的预期效果
3. 考虑实施成本和风险
4. 按优先级排序`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `数据：\n${JSON.stringify(currentData.data, null, 2)}\n\n请提供优化建议。` }
    ];

    const response = await this.aiService.chat(messages, {
      temperature: 0.7,
      maxTokens: 2000
    });

    return {
      target,
      currentData: currentData,
      optimizations: response.content
    };
  }

  /**
   * 告警管理
   */
  async manageAlert(target, parameters) {
    const { action = 'check', threshold } = parameters;

    if (action === 'check') {
      // 检查是否需要告警
      const data = await this.queryData(target, parameters);
      const anomalies = await this.aiService.detectAnomalies(target, data.data);

      return {
        target,
        needsAlert: true, // 简化实现，实际应根据异常判断
        anomalies: anomalies.anomalies,
        data: data
      };
    }

    throw new Error(`不支持的告警操作: ${action}`);
  }

  /**
   * 执行自定义查询
   */
  async executeCustomQuery(target, parameters) {
    // 使用AI生成SQL查询（需要谨慎处理以防SQL注入）
    logger.warn('执行自定义查询', { target, parameters });
    
    // 这里应该有严格的安全控制
    throw new Error('自定义查询功能暂未实现，需要额外的安全审查');
  }

  /**
   * 解析时间范围
   */
  parseTimeRange(timeRange) {
    const now = new Date();
    let start, end = now;

    if (typeof timeRange === 'object' && timeRange.start && timeRange.end) {
      return {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      };
    }

    switch (timeRange) {
      case 'today':
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      
      case 'yesterday':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      
      case 'week':
      case 'weekly':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      
      case 'month':
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      
      case 'last_month':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      
      default:
        // 默认最近7天
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  /**
   * 记录AI操作日志
   */
  async logAIOperation(instruction, intent, result) {
    // 这里可以记录到数据库或日志文件
    logger.info('AI操作记录', {
      instruction,
      operation: intent.operation,
      target: intent.target,
      success: result.success !== false,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 获取AI能力列表
   */
  getCapabilities() {
    return {
      operations: this.allowedOperations,
      targets: ['orders', 'users', 'products', 'commissions', 'inventory'],
      features: [
        '自然语言数据查询',
        '智能业务分析',
        '自动报告生成',
        '异常检测和告警',
        '智能推荐系统',
        '优化建议',
        '多维度数据洞察'
      ],
      examples: [
        '分析最近7天的订单趋势',
        '检测异常的佣金记录',
        '推荐给用户适合的商品',
        '生成本月的业绩报告',
        '找出库存异常的商品',
        '优化代理商的进货策略'
      ]
    };
  }
}

// 导出单例
module.exports = new AIManagementService();
