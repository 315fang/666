const { sequelize, Product, Order, User, AppConfig, Content } = require('../models');
const { Op } = require('sequelize');
const AIService = require('./AIService');

/**
 * AI User Agent Service
 * 
 * Empowering the end-user with AI tools to:
 * 1. Search Products (Knowledge Base)
 * 2. Check Order Status (Personal Assistant)
 * 3. Track Logistics (Service)
 * 4. Get Store Policies (Knowledge Base)
 */
class AIUserAgentService {
    constructor() {
        this.tools = {
            search_products: {
                description: 'Search for products in the store. Args: { keyword: string, price_min: number, price_max: number }',
                handler: this.searchProducts.bind(this)
            },
            get_my_orders: {
                description: 'Check my recent orders. Args: { status: "pending"|"paid"|"shipped"|"completed", limit: number }',
                handler: this.getMyOrders.bind(this)
            },
            get_order_detail: {
                description: 'Get details of a specific order. Args: { order_id: string }',
                handler: this.getOrderDetail.bind(this)
            },
            get_store_policy: {
                description: 'Get store policies (refund, shipping, about). Args: { type: "refund"|"shipping"|"about" }',
                handler: this.getStorePolicy.bind(this)
            }
        };
    }

    async processMessage(messages, userId) {
        try {
            // 1. Construct System Prompt
            const toolDescriptions = Object.entries(this.tools).map(([name, tool]) => {
                return `- ${name}: ${tool.description}`;
            }).join('\n');

            const systemPrompt = `
You are the intelligent shopping assistant for the "Zhenxuan" S2B2C Mall.
You help users find products, check orders, and answer questions about the store.

AVAILABLE TOOLS:
${toolDescriptions}

INSTRUCTIONS:
- If the user asks for products, orders, or policies, return a JSON tool call.
- Format: { "tool": "tool_name", "args": { ... } }
- If no tool is needed, answer politely in text.
- Be helpful, friendly, and concise.
- Use emojis to make the conversation lively. 🌟

Current Time: ${new Date().toISOString()}
User ID: ${userId}
            `;

            // Adjust messages structure for AI Service
            // If the last message is from user, we prepend system prompt
            // (In a real app, we might maintain a session, but here we rebuild context)
            const chatMessages = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];

            // 2. AI Decision
            const aiResponse = await AIService.chat(chatMessages);
            
            // 3. Check for Tool Call
            let toolCall;
            try {
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.tool && this.tools[parsed.tool]) {
                        toolCall = parsed;
                    }
                }
            } catch (e) {
                // Ignore
            }

            if (toolCall) {
                console.log(`[UserAgent] Executing tool: ${toolCall.tool}`, toolCall.args);
                let toolResult;
                try {
                    // Pass userId for security context
                    toolResult = await this.tools[toolCall.tool].handler(toolCall.args, userId);
                } catch (err) {
                    toolResult = { error: err.message };
                }

                // 4. Feed result back
                chatMessages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
                chatMessages.push({ role: 'user', content: `Tool Result: ${JSON.stringify(toolResult)}\n\nPlease summarize this for me.` });

                const finalResponse = await AIService.chat(chatMessages);
                return finalResponse;
            } else {
                return aiResponse;
            }

        } catch (error) {
            console.error('[UserAgent] Error:', error);
            return '抱歉，我现在有点忙，请稍后再试。😓';
        }
    }

    // ================= TOOL IMPLEMENTATIONS =================

    async searchProducts({ keyword, price_min, price_max }, userId) {
        const where = { status: 1 }; // Only active products
        if (keyword) {
            where.name = { [Op.like]: `%${keyword}%` };
        }
        if (price_min) {
            where.retail_price = { ...where.retail_price, [Op.gte]: price_min };
        }
        if (price_max) {
            where.retail_price = { ...where.retail_price, [Op.lte]: price_max };
        }

        const products = await Product.findAll({
            where,
            attributes: ['id', 'name', 'retail_price', 'sales_count'],
            limit: 5,
            order: [['sales_count', 'DESC']]
        });

        if (products.length === 0) return { message: "没有找到相关商品" };
        return products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.retail_price,
            sales: p.sales_count
        }));
    }

    async getMyOrders({ status, limit = 3 }, userId) {
        const where = { user_id: userId };
        if (status) where.status = status;

        const orders = await Order.findAll({
            where,
            attributes: ['id', 'order_no', 'status', 'total_amount', 'created_at'],
            limit: parseInt(limit),
            order: [['created_at', 'DESC']]
        });

        if (orders.length === 0) return { message: "您近期没有相关订单" };
        return orders;
    }

    async getOrderDetail({ order_id }, userId) {
        // Allow searching by ID or Order No
        const order = await Order.findOne({
            where: {
                [Op.and]: [
                    { user_id: userId },
                    { 
                        [Op.or]: [
                            { id: order_id },
                            { order_no: order_id }
                        ]
                    }
                ]
            }
        });

        if (!order) return { error: "未找到该订单或无权查看" };
        
        // Mock tracking info for now since we don't have a real logistics API integration
        const logistics = {
            company: order.logistics_company || '顺丰速运',
            tracking_no: order.tracking_number || 'SF1234567890',
            status: '运输中'
        };

        return {
            order_no: order.order_no,
            status: order.status,
            amount: order.total_amount,
            items: order.snap_items, // Assuming JSON field
            logistics: order.status === 'shipped' ? logistics : '尚未发货'
        };
    }

    async getStorePolicy({ type }, userId) {
        // Try to fetch from Content/AppConfig, fallback to defaults
        // This is the "Knowledge Base" part
        
        // 1. Try AppConfig
        const configKey = `policy_${type}`;
        const config = await AppConfig.findOne({ where: { config_key: configKey } });
        if (config) return { content: config.config_value };

        // 2. Try Content
        const content = await Content.findOne({ 
            where: { 
                type: 'page', 
                slug: type 
            } 
        });
        if (content) return { title: content.title, content: content.content };

        // 3. Fallback Knowledge
        const defaults = {
            refund: "我们的退款政策：支持7天无理由退换货。质量问题由商家承担运费，非质量问题由买家承担。",
            shipping: "发货政策：一般情况下，订单将在24小时内发货。默认使用中通或圆通快递。",
            about: "臻选商城致力于为您提供全球精选好物，品质保证，售后无忧。"
        };

        return { content: defaults[type] || defaults.about };
    }
}

module.exports = new AIUserAgentService();
