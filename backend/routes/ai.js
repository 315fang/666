/**
 * AI API 路由
 * 提供AI功能的HTTP接口
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const AIService = require('../services/AIService');
const AIManagementService = require('../services/AIManagementService');
const logger = require('../utils/logger');

/**
 * 速率限制中间件 - 限制AI调用频率
 */
const rateLimit = require('express-rate-limit');
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20, // 最多20次请求
  message: 'AI调用频率过高，请稍后再试',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * AI权限验证中间件
 */
const validateAIPermission = (req, res, next) => {
  // 检查用户是否有AI功能权限
  const user = req.user;
  
  if (!user) {
    return res.status(401).json({
      code: 401,
      message: '未登录'
    });
  }

  // 管理员和代理商可以使用AI功能
  if (user.role_level >= 2 || user.is_admin) {
    next();
  } else {
    res.status(403).json({
      code: 403,
      message: 'AI功能仅对代理商和管理员开放'
    });
  }
};

/**
 * GET /api/ai/health
 * AI服务健康检查
 */
router.get('/health', async (req, res) => {
  try {
    const health = await AIService.healthCheck();
    res.json({
      code: 0,
      data: health
    });
  } catch (error) {
    logger.error('AI健康检查失败', error);
    res.status(500).json({
      code: 500,
      message: 'AI服务不可用',
      error: error.message
    });
  }
});

/**
 * GET /api/ai/capabilities
 * 获取AI能力列表
 */
router.get('/capabilities', authenticateToken, validateAIPermission, (req, res) => {
  try {
    const capabilities = AIManagementService.getCapabilities();
    res.json({
      code: 0,
      data: capabilities
    });
  } catch (error) {
    logger.error('获取AI能力失败', error);
    res.status(500).json({
      code: 500,
      message: '获取AI能力失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/chat
 * 通用AI对话接口
 */
router.post('/chat', authenticateToken, validateAIPermission, aiRateLimiter, async (req, res) => {
  try {
    const { messages, options = {} } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        code: 400,
        message: '无效的消息格式'
      });
    }

    // 添加用户上下文
    const systemContext = {
      role: 'system',
      content: `你是"臻选商城"S2B2C数字化分销系统的AI助手。当前用户信息：
- 用户ID: ${req.user.id}
- 昵称: ${req.user.nickname || '未设置'}
- 角色级别: ${['普通用户', '会员', '团长', '代理商'][req.user.role_level]}

请根据用户角色提供适当的帮助。`
    };

    const fullMessages = [systemContext, ...messages];

    const response = await AIService.chat(fullMessages, options);

    res.json({
      code: 0,
      data: {
        content: response.content,
        role: response.role,
        usage: response.usage
      }
    });

  } catch (error) {
    logger.error('AI对话失败', error);
    res.status(500).json({
      code: 500,
      message: 'AI对话失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/manage
 * AI智能管理接口 - 核心功能
 * 允许通过自然语言指令管理系统
 */
router.post('/manage', authenticateToken, validateAIPermission, aiRateLimiter, async (req, res) => {
  try {
    const { instruction, context = {} } = req.body;

    if (!instruction) {
      return res.status(400).json({
        code: 400,
        message: '请提供管理指令'
      });
    }

    // 配置权限
    const permissions = {
      allowedOperations: req.user.is_admin 
        ? AIManagementService.allowedOperations // 管理员全部权限
        : ['query_data', 'analyze_business', 'recommend'] // 代理商部分权限
    };

    // 添加用户上下文
    const fullContext = {
      ...context,
      user: {
        id: req.user.id,
        nickname: req.user.nickname,
        role_level: req.user.role_level,
        is_admin: req.user.is_admin
      }
    };

    const result = await AIManagementService.executeInstruction(
      instruction,
      fullContext,
      permissions
    );

    if (result.success) {
      res.json({
        code: 0,
        data: result
      });
    } else {
      res.status(400).json({
        code: 400,
        message: result.error,
        data: result
      });
    }

  } catch (error) {
    logger.error('AI管理指令执行失败', error);
    res.status(500).json({
      code: 500,
      message: 'AI管理指令执行失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/analyze
 * 数据分析接口
 */
router.post('/analyze', authenticateToken, validateAIPermission, aiRateLimiter, async (req, res) => {
  try {
    const { analysisType, data, question } = req.body;

    if (!analysisType || !data) {
      return res.status(400).json({
        code: 400,
        message: '请提供分析类型和数据'
      });
    }

    const analysis = await AIService.analyzeData(
      analysisType,
      data,
      question || `请分析这些${analysisType}数据`
    );

    res.json({
      code: 0,
      data: analysis
    });

  } catch (error) {
    logger.error('数据分析失败', error);
    res.status(500).json({
      code: 500,
      message: '数据分析失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/recommend
 * 智能推荐接口
 */
router.post('/recommend', authenticateToken, aiRateLimiter, async (req, res) => {
  try {
    const { recommendType, context } = req.body;

    if (!recommendType || !context) {
      return res.status(400).json({
        code: 400,
        message: '请提供推荐类型和上下文信息'
      });
    }

    const recommendation = await AIService.getRecommendation(
      recommendType,
      context
    );

    res.json({
      code: 0,
      data: recommendation
    });

  } catch (error) {
    logger.error('智能推荐失败', error);
    res.status(500).json({
      code: 500,
      message: '智能推荐失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/answer
 * 业务问答接口
 */
router.post('/answer', authenticateToken, aiRateLimiter, async (req, res) => {
  try {
    const { question, context = {} } = req.body;

    if (!question) {
      return res.status(400).json({
        code: 400,
        message: '请提供问题'
      });
    }

    // 添加用户上下文
    const fullContext = {
      ...context,
      user: {
        id: req.user.id,
        role_level: req.user.role_level
      }
    };

    const answer = await AIService.answerBusinessQuestion(question, fullContext);

    res.json({
      code: 0,
      data: answer
    });

  } catch (error) {
    logger.error('业务问答失败', error);
    res.status(500).json({
      code: 500,
      message: '业务问答失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/detect-anomaly
 * 异常检测接口
 */
router.post('/detect-anomaly', authenticateToken, validateAIPermission, aiRateLimiter, async (req, res) => {
  try {
    const { anomalyType, data } = req.body;

    if (!anomalyType || !data) {
      return res.status(400).json({
        code: 400,
        message: '请提供异常类型和数据'
      });
    }

    const anomalies = await AIService.detectAnomalies(anomalyType, data);

    res.json({
      code: 0,
      data: anomalies
    });

  } catch (error) {
    logger.error('异常检测失败', error);
    res.status(500).json({
      code: 500,
      message: '异常检测失败',
      error: error.message
    });
  }
});

/**
 * POST /api/ai/generate-report
 * 报告生成接口
 */
router.post('/generate-report', authenticateToken, validateAIPermission, aiRateLimiter, async (req, res) => {
  try {
    const { reportType, data, period } = req.body;

    if (!reportType || !data || !period) {
      return res.status(400).json({
        code: 400,
        message: '请提供报告类型、数据和周期'
      });
    }

    const report = await AIService.generateReport(reportType, data, period);

    res.json({
      code: 0,
      data: report
    });

  } catch (error) {
    logger.error('报告生成失败', error);
    res.status(500).json({
      code: 500,
      message: '报告生成失败',
      error: error.message
    });
  }
});

module.exports = router;
