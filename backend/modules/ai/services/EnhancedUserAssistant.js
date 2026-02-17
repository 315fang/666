const ToolRegistry = require('./ToolRegistry');
const AIService = require('../../services/AIService');
const { User, Product, Order, Cart, AppConfig, Content } = require('../../models');
const { Op } = require('sequelize');

/**
 * 增强版用户AI助手服务
 * 
 * 特性：
 * 1. 统一工具注册和管理
 * 2. 支持多轮对话
 * 3. 上下文记忆
 * 4. 富文本回复
 */
class EnhancedUserAssistant {
    constructor() {
        this.sessions = new Map(); // 会话缓存
        this.sessionExpiry = 30 * 60 * 1000; // 30分钟过期
        this.initializeTools();
    }

    /**
     * 初始化所有工具
     */
    initializeTools() {
        // ========== 查询类工具 ==========
        
        // 1. 搜索商品
        ToolRegistry.register('search_products', {
            description: '搜索商品，支持关键词和价格范围筛选',
            category: 'query',
            parameters: {
                keyword: 'string (可选) - 商品关键词',
                price_min: 'number (可选) - 最低价格',
                price_max: 'number (可选) - 最高价格',
                category_id: 'number (可选) - 分类ID',
                limit: 'number (可选) - 返回数量，默认5'
            },
            enabled: true
        }, async (args, context) => {
            const where = { status: 1 };
            
            if (args.keyword) {
                where.name = { [Op.like]: `%${args.keyword}%` };
            }
            if (args.price_min) {
                where.retail_price = { [Op.gte]: args.price_min };
            }
            if (args.price_max) {
                where.retail_price = { ...where.retail_price, [Op.lte]: args.price_max };
            }
            if (args.category_id) {
                where.category_id = args.category_id;
            }

            const products = await Product.findAll({
                where,
                attributes: ['id', 'name', 'retail_price', 'market_price', 'sales_count', 'main_image'],
                limit: args.limit || 5,
                order: [['sales_count', 'DESC']]
            });

            if (products.length === 0) {
                return { message: "没有找到符合条件的商品", products: [] };
            }

            return {
                count: products.length,
                products: products.map(p => ({
                    id: p.id,
                    name: p.name,
                    price: parseFloat(p.retail_price).toFixed(2),
                    marketPrice: p.market_price ? parseFloat(p.market_price).toFixed(2) : null,
                    sales: p.sales_count,
                    image: p.main_image
                }))
            };
        });

        // 2. 查询我的订单
        ToolRegistry.register('get_my_orders', {
            description: '查询当前用户的订单列表',
            category: 'query',
            parameters: {
                status: 'string (可选) - 订单状态：pending/paid/shipped/completed',
                limit: 'number (可选) - 返回数量，默认5',
                days: 'number (可选) - 最近N天的订单'
            },
            enabled: true
        }, async (args, context) => {
            const where = { user_id: context.userId };
            
            if (args.status) {
                where.status = args.status;
            }
            if (args.days) {
                where.created_at = {
                    [Op.gte]: new Date(Date.now() - args.days * 24 * 60 * 60 * 1000)
                };
            }

            const orders = await Order.findAll({
                where,
                attributes: ['id', 'order_no', 'status', 'total_amount', 'created_at', 'snap_items'],
                limit: parseInt(args.limit) || 5,
                order: [['created_at', 'DESC']]
            });

            if (orders.length === 0) {
                return { message: "您还没有相关订单", orders: [] };
            }

            return {
                count: orders.length,
                orders: orders.map(o => ({
                    id: o.id,
                    orderNo: o.order_no,
                    status: o.status,
                    statusText: this.getOrderStatusText(o.status),
                    amount: parseFloat(o.total_amount).toFixed(2),
                    items: o.snap_items ? (typeof o.snap_items === 'string' ? JSON.parse(o.snap_items) : o.snap_items) : [],
                    createdAt: o.created_at
                }))
            };
        });

        // 3. 订单详情
        ToolRegistry.register('get_order_detail', {
            description: '查询特定订单的详细信息',
            category: 'query',
            parameters: {
                order_id: 'string - 订单ID或订单号'
            },
            enabled: true
        }, async (args, context) => {
            const order = await Order.findOne({
                where: {
                    [Op.and]: [
                        { user_id: context.userId },
                        {
                            [Op.or]: [
                                { id: args.order_id },
                                { order_no: args.order_id }
                            ]
                        }
                    ]
                }
            });

            if (!order) {
                return { error: "未找到该订单或无权查看" };
            }

            const logistics = order.status === 'shipped' ? {
                company: order.logistics_company || '顺丰速运',
                trackingNo: order.tracking_number || 'SF1234567890',
                status: '运输中',
                updateTime: new Date().toLocaleString()
            } : null;

            return {
                orderNo: order.order_no,
                status: order.status,
                statusText: this.getOrderStatusText(order.status),
                amount: parseFloat(order.total_amount).toFixed(2),
                items: order.snap_items ? (typeof order.snap_items === 'string' ? JSON.parse(order.snap_items) : order.snap_items) : [],
                logistics,
                createdAt: order.created_at,
                payTime: order.paid_at,
                shipTime: order.shipped_at,
                address: order.address_snapshot
            };
        });

        // 4. 获取商城政策
        ToolRegistry.register('get_store_policy', {
            description: '获取商城政策（退款、发货、关于）',
            category: 'query',
            parameters: {
                type: 'string - 类型：refund(退款)/shipping(发货)/about(关于)/vip(会员)'
            },
            enabled: true
        }, async (args, context) => {
            const defaults = {
                refund: {
                    title: '退款政策',
                    content: '支持7天无理由退换货。质量问题由商家承担运费，非质量问题由买家承担。退款将在3-5个工作日内原路返回。'
                },
                shipping: {
                    title: '发货政策',
                    content: '一般情况下，订单将在24小时内发货。默认使用中通或圆通快递，偏远地区可能需要3-5天。'
                },
                about: {
                    title: '关于我们',
                    content: '臻选商城致力于为您提供全球精选好物，品质保证，售后无忧。成为会员享受更多优惠！'
                },
                vip: {
                    title: '会员权益',
                    content: '普通会员：享受9.5折优惠\n高级会员：享受9折优惠\nVIP会员：享受8.5折优惠+专属客服'
                }
            };

            // 先查数据库
            const config = await AppConfig.findOne({
                where: { config_key: `policy_${args.type}` }
            });

            if (config && config.config_value) {
                return {
                    type: args.type,
                    title: config.config_value.split('\n')[0] || defaults[args.type]?.title,
                    content: config.config_value
                };
            }

            return {
                type: args.type,
                ...defaults[args.type] || defaults.about
            };
        });

        // 5. 查询库存
        ToolRegistry.register('check_inventory', {
            description: '查询商品库存',
            category: 'query',
            parameters: {
                product_id: 'number - 商品ID'
            },
            requiredRole: 'member', // 会员以上可查看
            enabled: true
        }, async (args, context) => {
            const product = await Product.findByPk(args.product_id, {
                attributes: ['id', 'name', 'stock_quantity', 'sku_type']
            });

            if (!product) {
                return { error: "商品不存在" };
            }

            return {
                productId: product.id,
                name: product.name,
                stock: product.stock_quantity,
                hasSku: product.sku_type === 'multiple'
            };
        });

        // 6. 计算价格（含会员价、佣金预览）
        ToolRegistry.register('calculate_price', {
            description: '计算商品实际价格，包括会员折扣和佣金预览',
            category: 'query',
            parameters: {
                product_id: 'number - 商品ID',
                quantity: 'number (可选) - 数量，默认1'
            },
            enabled: true
        }, async (args, context) => {
            const product = await Product.findByPk(args.product_id, {
                attributes: ['id', 'name', 'retail_price', 'price_member', 'price_leader', 'price_agent', 'commission_rate']
            });

            if (!product) {
                return { error: "商品不存在" };
            }

            const quantity = args.quantity || 1;
            const user = await User.findByPk(context.userId);
            const roleLevel = user ? user.role_level : 0;

            // 根据角色计算价格
            let price = parseFloat(product.retail_price);
            if (roleLevel >= 3 && product.price_agent) {
                price = parseFloat(product.price_agent);
            } else if (roleLevel >= 2 && product.price_leader) {
                price = parseFloat(product.price_leader);
            } else if (roleLevel >= 1 && product.price_member) {
                price = parseFloat(product.price_member);
            }

            const total = price * quantity;

            // 佣金预览（团长及以上）
            let commission = null;
            if (roleLevel >= 2 && product.commission_rate) {
                commission = {
                    rate: product.commission_rate,
                    amount: (total * product.commission_rate / 100).toFixed(2)
                };
            }

            return {
                productName: product.name,
                quantity,
                unitPrice: price.toFixed(2),
                originalPrice: parseFloat(product.retail_price).toFixed(2),
                total: total.toFixed(2),
                roleLevel,
                commission,
                savings: (parseFloat(product.retail_price) * quantity - total).toFixed(2)
            };
        });

        // ========== 操作类工具 ==========

        // 7. 添加到购物车
        ToolRegistry.register('add_to_cart', {
            description: '将商品添加到购物车',
            category: 'action',
            parameters: {
                product_id: 'number - 商品ID',
                sku_id: 'number (可选) - SKU ID',
                quantity: 'number - 数量'
            },
            enabled: true
        }, async (args, context) => {
            // 这里调用现有的购物车逻辑
            // 简化示例，实际需要调用CartService
            const { CartService } = require('../../services');
            
            try {
                const result = await CartService.addToCart({
                    user_id: context.userId,
                    product_id: args.product_id,
                    sku_id: args.sku_id,
                    quantity: args.quantity
                });

                return {
                    success: true,
                    message: "已成功添加到购物车",
                    cartCount: result.cartCount
                };
            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // 8. 创建快速订单（一键下单）
        ToolRegistry.register('create_quick_order', {
            description: '快速创建订单（使用默认地址）',
            category: 'action',
            parameters: {
                product_id: 'number - 商品ID',
                sku_id: 'number (可选) - SKU ID',
                quantity: 'number - 数量'
            },
            requiredRole: 'user',
            enabled: true
        }, async (args, context) => {
            // 简化示例，实际需要完整的下单流程
            return {
                success: true,
                message: "订单创建功能需要在确认后执行",
                requiresConfirmation: true,
                preview: {
                    productId: args.product_id,
                    quantity: args.quantity,
                    note: '请在确认页面完成支付'
                }
            };
        });

        console.log('[EnhancedUserAssistant] 工具初始化完成，共注册', ToolRegistry.getStats().total, '个工具');
    }

    /**
     * 处理用户消息
     * @param {string} message - 用户消息
     * @param {number} userId - 用户ID
     * @param {string} sessionId - 会话ID
     * @param {Object} context - 上下文信息
     */
    async processMessage(message, userId, sessionId = null, context = {}) {
        try {
            // 获取或创建会话
            const session = this.getOrCreateSession(sessionId, userId);
            sessionId = session.id;

            // 添加用户消息到历史
            session.messages.push({
                role: 'user',
                content: message,
                timestamp: new Date()
            });

            // 限制历史长度（保留最近20条）
            if (session.messages.length > 20) {
                session.messages = session.messages.slice(-20);
            }

            // 构建系统提示词
            const systemPrompt = this.buildSystemPrompt(context, userId);

            // 准备AI消息
            const chatMessages = [
                { role: 'system', content: systemPrompt },
                ...session.messages.map(m => ({
                    role: m.role === 'ai' ? 'assistant' : m.role,
                    content: m.content
                }))
            ];

            // 调用AI决策
            const aiResponse = await AIService.chat(chatMessages);

            // 解析工具调用
            const toolCall = this.parseToolCall(aiResponse);

            let finalResponse;
            let actions = [];

            if (toolCall && ToolRegistry.isAvailable(toolCall.tool, { role: context.role, userId })) {
                // 执行工具
                console.log(`[EnhancedUserAssistant] 执行工具: ${toolCall.tool}`, toolCall.args);
                
                const toolResult = await ToolRegistry.execute(
                    toolCall.tool, 
                    toolCall.args, 
                    { userId, role: context.role }
                );

                // 根据工具结果生成响应
                if (toolResult.success) {
                    // 特殊处理某些操作类工具
                    if (toolCall.tool === 'add_to_cart' && toolResult.data.success) {
                        actions.push({
                            type: 'cart_update',
                            count: toolResult.data.cartCount
                        });
                    }

                    if (toolCall.tool === 'create_quick_order' && toolResult.data.requiresConfirmation) {
                        actions.push({
                            type: 'confirm_order',
                            data: toolResult.data.preview
                        });
                    }

                    // 让AI总结工具结果
                    const summaryMessages = [
                        ...chatMessages,
                        { role: 'assistant', content: JSON.stringify(toolCall) },
                        { 
                            role: 'user', 
                            content: `工具执行结果: ${JSON.stringify(toolResult.data)}\n\n请用友好、口语化的方式总结结果给用户。如果是商品列表，请突出显示价格和销量。`
                        }
                    ];

                    finalResponse = await AIService.chat(summaryMessages);
                } else {
                    finalResponse = `抱歉，操作失败了：${toolResult.error || '未知错误'}。请稍后再试或联系客服。😅`;
                }
            } else {
                // 没有工具调用，直接使用AI回复
                finalResponse = aiResponse;
            }

            // 添加AI回复到历史
            session.messages.push({
                role: 'ai',
                content: finalResponse,
                timestamp: new Date()
            });

            session.lastActivity = new Date();

            return {
                success: true,
                sessionId,
                response: finalResponse,
                actions,
                toolUsed: toolCall?.tool || null
            };

        } catch (error) {
            console.error('[EnhancedUserAssistant] 处理消息失败:', error);
            return {
                success: false,
                error: '服务暂时不可用，请稍后再试',
                sessionId
            };
        }
    }

    /**
     * 构建系统提示词
     */
    buildSystemPrompt(context, userId) {
        const toolsDesc = ToolRegistry.getToolsDescription({ role: context.role });
        
        let prompt = `你是臻选商城的智能购物助手"小臻"。你热情、专业、乐于助人。

可用工具:
${toolsDesc}

指令:
1. 如果用户询问商品、订单、价格等信息，使用对应工具查询后回复
2. 工具调用格式: {"tool": "tool_name", "args": {...}}
3. 回复要友好、口语化，适当使用emoji
4. 如果用户想下单，引导使用 create_quick_order 工具
5. 不清楚时诚实告知，不要编造信息

当前用户ID: ${userId}
当前时间: ${new Date().toLocaleString()}`;

        // 添加上下文信息
        if (context.product) {
            prompt += `\n\n用户正在浏览商品:\n名称: ${context.product.name}\n价格: ¥${context.product.price}\n`;
        }

        if (context.role) {
            prompt += `\n用户身份: ${context.role}`;
        }

        return prompt;
    }

    /**
     * 解析工具调用
     */
    parseToolCall(response) {
        try {
            // 尝试从回复中提取JSON
            const jsonMatch = response.match(/\{[\s\S]*?"tool"[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.tool && ToolRegistry.get(parsed.tool)) {
                    return {
                        tool: parsed.tool,
                        args: parsed.args || {}
                    };
                }
            }
        } catch (e) {
            // 不是工具调用，忽略
        }
        return null;
    }

    /**
     * 获取或创建会话
     */
    getOrCreateSession(sessionId, userId) {
        // 清理过期会话
        this.cleanExpiredSessions();

        if (sessionId && this.sessions.has(sessionId)) {
            return this.sessions.get(sessionId);
        }

        // 创建新会话
        const newSession = {
            id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            messages: [],
            createdAt: new Date(),
            lastActivity: new Date()
        };

        this.sessions.set(newSession.id, newSession);
        return newSession;
    }

    /**
     * 清理过期会话
     */
    cleanExpiredSessions() {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (now - session.lastActivity.getTime() > this.sessionExpiry) {
                this.sessions.delete(id);
            }
        }
    }

    /**
     * 获取会话历史
     */
    getSessionHistory(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? session.messages : [];
    }

    /**
     * 获取订单状态文本
     */
    getOrderStatusText(status) {
        const map = {
            'pending': '待付款',
            'paid': '待发货',
            'shipped': '待收货',
            'completed': '已完成',
            'cancelled': '已取消',
            'refunding': '退款中'
        };
        return map[status] || status;
    }

    /**
     * 获取工具列表（供后台管理）
     */
    getToolsList(filters = {}) {
        return ToolRegistry.list(filters);
    }

    /**
     * 启用/禁用工具（供后台管理）
     */
    setToolEnabled(name, enabled) {
        ToolRegistry.setEnabled(name, enabled);
    }
}

module.exports = new EnhancedUserAssistant();
