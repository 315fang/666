/**
 * Swagger / OpenAPI 配置
 * 
 * 访问地址：http://localhost:3000/api/docs
 */
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'S2B2C 数字化加盟系统 API',
            version: '1.0.0',
            description: `
S2B2C 数字化加盟小程序后端 API 文档

**认证方式**：Bearer Token（JWT）

- 用户端接口：\`Authorization: Bearer <user_token>\`
- 管理端接口：\`Authorization: Bearer <admin_token>\`

**角色权限**（管理端）：
| 角色 | 权限 |
|------|------|
| super_admin | 全部权限 |
| admin | 商品+订单+用户+内容 |
| operator | 商品+订单+内容 |
| finance | 订单+提现+结算 |
| customer_service | 订单+售后+用户 |
            `,
            contact: {
                name: 'API 支持',
                email: 'admin@example.com'
            }
        },
        servers: [
            {
                url: process.env.API_BASE_URL || 'http://localhost:3000',
                description: process.env.NODE_ENV === 'production' ? '生产环境' : '开发环境'
            }
        ],
        components: {
            securitySchemes: {
                UserAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: '用户端 JWT Token'
                },
                AdminAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: '管理端 JWT Token'
                }
            },
            schemas: {
                // ===== 通用响应 =====
                SuccessResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'integer', example: 0 },
                        message: { type: 'string', example: '操作成功' },
                        data: { type: 'object' }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'integer', example: -1 },
                        message: { type: 'string', example: '操作失败' }
                    }
                },
                PaginatedResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'integer', example: 0 },
                        data: {
                            type: 'object',
                            properties: {
                                list: { type: 'array', items: { type: 'object' } },
                                total: { type: 'integer', example: 100 },
                                page: { type: 'integer', example: 1 },
                                limit: { type: 'integer', example: 10 }
                            }
                        }
                    }
                },
                // ===== 商品 =====
                Product: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string', description: '商品名称' },
                        description: { type: 'string' },
                        retail_price: { type: 'number', description: '零售价' },
                        cost_price: { type: 'number', description: '成本价' },
                        stock: { type: 'integer' },
                        images: { type: 'array', items: { type: 'string' }, description: '图片URL数组' },
                        status: { type: 'integer', enum: [0, 1], description: '0=下架 1=上架' },
                        category_id: { type: 'integer' },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                // ===== 订单 =====
                Order: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        order_no: { type: 'string', description: '订单号' },
                        user_id: { type: 'integer' },
                        total_amount: { type: 'number', description: '订单总金额' },
                        actual_amount: { type: 'number', description: '实付金额' },
                        status: {
                            type: 'string',
                            enum: ['pending_payment', 'pending_shipment', 'shipped', 'completed', 'cancelled', 'refunding', 'refunded'],
                            description: '订单状态'
                        },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                // ===== 用户 =====
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        nickname: { type: 'string' },
                        avatar_url: { type: 'string' },
                        phone: { type: 'string' },
                        role_level: { type: 'integer', description: '0=普通 1=会员 2=经纪人 3=合伙人 4=经销商' },
                        balance: { type: 'number', description: '账户余额' },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                // ===== 佣金 =====
                Commission: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        user_id: { type: 'integer' },
                        amount: { type: 'number', description: '佣金金额' },
                        level: { type: 'integer', description: '分佣层级（1或2）' },
                        status: {
                            type: 'string',
                            enum: ['frozen', 'pending_approval', 'settled', 'rejected']
                        },
                        created_at: { type: 'string', format: 'date-time' }
                    }
                },
                // ===== 管理员登录 =====
                AdminLoginRequest: {
                    type: 'object',
                    required: ['username', 'password'],
                    properties: {
                        username: { type: 'string', example: 'admin' },
                        password: { type: 'string', format: 'password', example: 'password123' }
                    }
                },
                AdminLoginResponse: {
                    type: 'object',
                    properties: {
                        code: { type: 'integer', example: 0 },
                        data: {
                            type: 'object',
                            properties: {
                                token: { type: 'string', description: 'JWT Token' },
                                admin: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer' },
                                        username: { type: 'string' },
                                        role: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        tags: [
            { name: '管理端-认证', description: '管理员登录、会话管理' },
            { name: '管理端-商品', description: '商品和分类管理' },
            { name: '管理端-订单', description: '订单查看、发货、状态管理' },
            { name: '管理端-用户', description: '用户查看、角色调整' },
            { name: '管理端-佣金', description: '佣金审批与结算' },
            { name: '管理端-内容', description: 'Banner、图文内容管理' },
            { name: '管理端-经销商', description: '经销商申请审批' },
            { name: '管理端-统计', description: '数据统计和报表' },
            { name: '管理端-系统', description: '系统配置、日志、账号管理' },
            { name: '用户端-认证', description: '微信登录、注册' },
            { name: '用户端-商品', description: '商品列表、详情' },
            { name: '用户端-订单', description: '下单、支付、用户订单' },
            { name: '用户端-分销', description: '分销关系、佣金查询' }
        ]
    },
    // 扫描路由文件（JSDoc 注释来源）
    apis: [
        './routes/admin/index.js',
        './routes/admin/config.js',
        './routes/auth.js',
        './routes/products.js',
        './routes/orders.js',
        './routes/commissions.js',
        './routes/distribution.js'
    ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
