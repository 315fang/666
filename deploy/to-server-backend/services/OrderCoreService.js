/**
 * 订单核心：购物袋下单、微信支付 V3 预下单与回调、发货、确认收货、取消等。
 *
 * 支付：正式环境走 prepay + 微信服务器 POST /api/wechat/pay/notify（JSON，签名校验见 utils/wechat.js）。
 * 优惠券：支持全场 / 指定商品 / 指定分类（UserCoupon 快照上的 scope、scope_ids），校验见 couponController。
 */
const { Order, Product, SKU, User, Cart, CommissionLog, Address, Notification, AppConfig, AgentWalletLog, SlashRecord, SlashActivity, GroupActivity, GroupOrder, GroupMember, ServiceStation, sequelize } = require('../models');
const { UserCoupon } = require('../models');
const { sendNotification } = require('../models/notificationUtil');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logOrder, logCommission, error: logError } = require('../utils/logger');
const { createUnifiedOrder, buildJsApiParams, decryptNotifyResource, verifyNotifySign, queryJsapiOrderByOutTradeNo } = require('../utils/wechat');
const PointService = require('./PointService');
const LimitedSpotService = require('./LimitedSpotService');
const CommissionService = require('./CommissionService');
const MemberTierService = require('./MemberTierService');
const AgentWalletService = require('./AgentWalletService');
const PricingService = require('./PricingService');
const WechatShoppingOrderService = require('./WechatShoppingOrderService');
const { generatePickupCredentials } = require('../controllers/pickupController');
const { attributeRegionalProfit } = require('../controllers/stationController');
const { calcCouponDiscount, isCouponApplicable } = require('../controllers/couponController');

let _orderSeq = 0;
const generateOrderNo = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    _orderSeq = (_orderSeq + 1) % 10000;
    const seq = String(_orderSeq).padStart(4, '0');
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    return "ORD" + year + month + day + hour + min + sec + seq + random;
};

/** 微信 JSAPI 下单 description，用于支付单与「小程序购物订单」展示（≤127 字） */
function buildWxJsapiShoppingDescription(order, productName) {
    const name = String(productName || '')
        .replace(/\s+/g, ' ')
        .trim();
    const displayName = name.length ? name : '商品';
    const q = Number(order.quantity);
    const suffix = Number.isFinite(q) && q > 1 ? `×${q}` : '';
    let desc = `${displayName}${suffix}`;
    const maxLen = 127;
    if (desc.length > maxLen) desc = desc.slice(0, maxLen);
    return desc;
}

const runAfterCommit = (transaction, task) => {
    const exec = () => {
        setImmediate(async () => {
            try {
                await task();
            } catch (e) {
                console.error('[OrderCore] afterCommit task failed:', e.message);
            }
        });
    };
    if (transaction && typeof transaction.afterCommit === 'function') {
        transaction.afterCommit(exec);
    } else {
        exec();
    }
};

/** 支付成功后异步上报「小程序购物订单」（notify 与主动查单补单共用） */
function scheduleShoppingOrderUploadAfterWechatPay(paidOrderId, notifySnap) {
    setImmediate(() => {
        (async () => {
            try {
                const row = await Order.findByPk(paidOrderId);
                if (!row) return;
                const prod = await Product.findByPk(row.product_id);
                await WechatShoppingOrderService.uploadAfterWechatPay({
                    order: row,
                    product: prod,
                    notifyData: notifySnap
                });
            } catch (e) {
                console.error('[ShoppingOrder] 异步上传失败:', e.message);
            }
        })();
    });
}

const calcShippingFeeByPolicy = (policy, address) => {
    const shipping = policy?.shipping || {};
    if (!shipping.remote_region_extra_fee_enabled) return 0;
    const fee = Number(shipping.remote_region_fee || 0);
    if (!fee) return 0;
    const regionText = `${address?.province || ''}${address?.city || ''}${address?.district || ''}`;
    const remoteRegions = Array.isArray(shipping.remote_regions) ? shipping.remote_regions : [];
    const isRemote = remoteRegions.some(region => region && regionText.includes(region));
    return isRemote ? fee : 0;
};

const _markOrderAsPaid = async (order, t) => {
    order.status = 'paid';
    order.paid_at = new Date();
    if (order.delivery_type === 'pickup' && !order.pickup_code) {
        const creds = generatePickupCredentials(order.id);
        order.pickup_code = creds.pickup_code;
        order.pickup_qr_token = creds.pickup_qr_token;
    }
    await order.save({ transaction: t });

    const childOrders = await Order.findAll({
        where: { parent_order_id: order.id },
        transaction: t,
        lock: t.LOCK.UPDATE
    });
    for (const child of childOrders) {
        if (child.status !== 'pending') {
            throw new Error("关联子订单状态异常");
        }
        child.status = 'paid';
        child.paid_at = new Date();
        await child.save({ transaction: t });
    }

    const buyer = await User.findByPk(order.buyer_id, { transaction: t });
    const amount = parseFloat(order.total_amount);
    const distributableAmount = parseFloat(order.actual_price || order.total_amount || 0);
    let growthBaseAmount = 0;
    try {
        const product = await Product.findByPk(order.product_id, { attributes: ['retail_price'], transaction: t });
        const cfg = await AppConfig.findOne({
            where: { config_key: `product_growth_reward_${order.product_id}`, status: 1 },
            transaction: t
        });
        const customReward = cfg ? parseFloat(cfg.config_value || 0) : 0;
        if (customReward > 0) {
            growthBaseAmount = customReward * (order.quantity || 1);
        } else {
            growthBaseAmount = parseFloat(product?.retail_price || order.actual_price || order.total_amount || 0) * (order.quantity || 1);
        }
    } catch (_) {
        growthBaseAmount = parseFloat(order.actual_price || order.total_amount || 0);
    }
    const buyerCity = buyer?.city || null;
    let upgradedToMember = false;
    const minPurchase = constants.UPGRADE_RULES.GUEST_TO_MEMBER.min_purchase_amount || 0;
    if (buyer.role_level === constants.ROLES.GUEST && amount >= minPurchase) {
        buyer.role_level = constants.ROLES.MEMBER;
        await buyer.save({ transaction: t });
        upgradedToMember = true;
    }
    await buyer.increment('total_sales', { by: amount, transaction: t });

    logOrder('订单支付', {
        userId: order.buyer_id,
        orderId: order.id,
        orderNo: order.order_no,
        amount
    });

    runAfterCommit(t, async () => {
        if (upgradedToMember) {
            await sendNotification(buyer.id, '身份升级成功', '恭喜！您已成功下单，系统已为您升级为"尊享会员"', 'upgrade');
        }
        const earnedPoints = Math.floor(amount);
        if (earnedPoints > 0) {
            await PointService.addPoints(order.buyer_id, earnedPoints, 'purchase', order.id, "消费积分");
            // 成长值按商品原价口径累计，不受优惠券/积分抵扣影响
            await PointService.addGrowthValue(order.buyer_id, growthBaseAmount, null, 'purchase');
        }
        const addrSnap = order?.address_snapshot || {};
        const location = {
            province: addrSnap?.province || buyer?.province || '',
            city: addrSnap?.city || buyerCity || '',
            district: addrSnap?.district || ''
        };
        if (location.province || location.city || location.district) {
            await attributeRegionalProfit(order.id, location, distributableAmount);
        }
        // 分红池自动累计：每笔订单按比例计提（使用独立事务 + increment 原子操作防竞态）
        try {
            const dividendRuleCfg = await AppConfig.findOne({
                where: { config_key: 'agent_system_dividend_rules', status: 1 }
            });
            const dRules = dividendRuleCfg ? JSON.parse(dividendRuleCfg.config_value) : {};
            if (dRules.enabled !== false) {
                const sourcePct = parseFloat(dRules.source_pct || 3) / 100;
                const contribution = parseFloat((amount * sourcePct).toFixed(2));
                if (contribution > 0) {
                    const poolT = await sequelize.transaction();
                    try {
                        const [poolCfg] = await AppConfig.findOrCreate({
                            where: { config_key: 'dividend_pool_balance' },
                            defaults: { config_value: '0', config_type: 'number', category: 'agent_system', status: 1 },
                            transaction: poolT, lock: poolT.LOCK.UPDATE
                        });
                        const current = parseFloat(poolCfg.config_value || 0);
                        poolCfg.config_value = String((current + contribution).toFixed(2));
                        await poolCfg.save({ transaction: poolT });
                        await poolT.commit();
                    } catch (innerErr) {
                        if (!poolT.finished) await poolT.rollback();
                        throw innerErr;
                    }
                }
            }
        } catch (e) { console.error('[分红池] 计提失败:', e.message); }

        // B2协助奖：如果购买者的推荐人是B1且B1的上线是B2，自动给B2发协助奖
        try {
            const { handleB2AssistBonus } = require('../utils/commission');
            const ROLES = require('../config/constants').ROLES;
            if (buyer.parent_id) {
                const b1 = await User.findByPk(buyer.parent_id, { attributes: ['id', 'role_level', 'parent_id'] });
                if (b1 && b1.role_level === ROLES.AGENT && b1.parent_id) {
                    const b2 = await User.findByPk(b1.parent_id, { attributes: ['id', 'role_level'] });
                    if (b2 && b2.role_level >= (ROLES.PARTNER || 4)) {
                        await handleB2AssistBonus(b2, b1, order.id);
                    }
                }
            }
        } catch (e) { console.error('[B2协助奖] 触发失败:', e.message); }
    });

    return { order, childOrders };
};

class OrderCoreService {
    static async createOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            // ★ 兼容两种下单格式:
            // 1. 前端标准: { items:[{product_id,sku_id,quantity,cart_id}], address_id, remark }
            // 2. 历史格式: { product_id, sku_id, quantity, address_id, remark, cart_id }
            let items = req.body.items;
            const address_id = req.body.address_id;
            const delivery_type = req.body.delivery_type === 'pickup' ? 'pickup' : 'express';
            const pickup_station_id = req.body.pickup_station_id ? parseInt(req.body.pickup_station_id, 10) : null;
            const remark = req.body.remark;
            const user_coupon_id = req.body.user_coupon_id || null;
            const points_to_use = parseInt(req.body.points_to_use) || 0;
            const slash_no = req.body.slash_no || null;
            const group_no = req.body.group_no || null;
            const limited_spot = req.body.limited_spot || null;

            if (!items || !Array.isArray(items) || items.length === 0) {
                const { product_id: pid, sku_id: sid, quantity: qty, cart_id: cid } = req.body;
                if (!pid || !qty || qty < 1) {
                    await t.rollback();
                    throw new Error('缺少必要参数（product_id/quantity 或 items[]）');
                }
                items = [{ product_id: pid, sku_id: sid, quantity: qty, cart_id: cid }];
            }

            let lsCtx = null;
            if (limited_spot && limited_spot.card_id && limited_spot.offer_id && items.length === 1) {
                lsCtx = await LimitedSpotService.resolveCreateContext({
                    card_id: limited_spot.card_id,
                    offer_id: limited_spot.offer_id,
                    redeem_points: !!limited_spot.redeem_points,
                    product_id: items[0].product_id,
                    sku_id: items[0].sku_id || null
                });
            }
            if (lsCtx && (user_coupon_id || points_to_use > 0)) {
                await t.rollback();
                throw new Error('活动专享单不支持叠加优惠券或积分抵扣');
            }
            if (lsCtx && (slash_no || group_no)) {
                await t.rollback();
                throw new Error('活动专享单不能与砍价/拼团同时使用');
            }

            for (const item of items) {
                if (!item.product_id || !item.quantity || item.quantity < 1) {
                    await t.rollback();
                    throw new Error('items 中每项都需要 product_id 和 quantity');
                }
            }

            let pickupStation = null;
            if (delivery_type === 'pickup') {
                if (!pickup_station_id) {
                    await t.rollback();
                    throw new Error('请选择自提门店');
                }
                pickupStation = await ServiceStation.findByPk(pickup_station_id, { transaction: t });
                if (!pickupStation || pickupStation.status !== 'active' || !Number(pickupStation.is_pickup_point)) {
                    await t.rollback();
                    throw new Error('自提门店不可用，请重新选择');
                }
            } else if (!address_id) {
                await t.rollback();
                throw new Error('请选择收货地址');
            }

            // 获取用户身份（所有商品共用同一个用户）
            const user = await User.findByPk(userId, { transaction: t });
            const roleLevel = user.role_level || 0;
            const purchaseLevel = await MemberTierService.getPurchaseLevelByCode(user.purchase_level_code);
            let agentId = user.agent_id || null;
            const commercePolicy = await MemberTierService.getCommercePolicy();
            const globalRate = commercePolicy?.global_discount?.enabled
                ? Number(commercePolicy?.global_discount?.rate || 1)
                : 1;
            const levelRate = commercePolicy?.member_level_extra_discount?.enabled
                ? await MemberTierService.getLevelDiscountRate(roleLevel)
                : 1;
            const finalDiscountRate = Number((globalRate * levelRate).toFixed(4));

            // 获取地址快照（快递必填地址；自提可选地址，无则用工站信息+用户手机）
            let addressSnapshot = null;
            let resolvedAddressId = address_id || null;
            if (delivery_type === 'express') {
                const addr = await Address.findOne({
                    where: { id: address_id, user_id: userId },
                    transaction: t
                });
                if (!addr) {
                    await t.rollback();
                    throw new Error('收货地址不存在或无权限使用');
                }
                addressSnapshot = {
                    receiver_name: addr.receiver_name,
                    phone: addr.phone,
                    province: addr.province,
                    city: addr.city,
                    district: addr.district,
                    detail: addr.detail
                };
            } else if (address_id) {
                const addr = await Address.findOne({
                    where: { id: address_id, user_id: userId },
                    transaction: t
                });
                if (addr) {
                    addressSnapshot = {
                        receiver_name: addr.receiver_name,
                        phone: addr.phone,
                        province: addr.province,
                        city: addr.city,
                        district: addr.district,
                        detail: `${addr.detail || ''}（到店自提｜${pickupStation.name}）`.trim()
                    };
                }
            }
            if (delivery_type === 'pickup' && !addressSnapshot) {
                addressSnapshot = {
                    receiver_name: user.nickname || '顾客',
                    phone: user.phone || '',
                    province: pickupStation.province,
                    city: pickupStation.city,
                    district: pickupStation.district || '',
                    detail: `到店自提｜${pickupStation.name}${pickupStation.address ? ' ' + pickupStation.address : ''}`
                };
                resolvedAddressId = null;
            }

            const distributorRole = user.parent_id
                ? (await User.findByPk(user.parent_id, { attributes: ['role_level'], transaction: t }))?.role_level || 0
                : null;

            const allOrders = []; // 收集所有创建的订单
            let totalAmountSum = 0;
            const orderProductIds = new Set();
            const orderCategoryIds = new Set();

            // ★★★ 对每个商品分别处理（多商品循环）
            for (const item of items) {
                const { product_id, sku_id, quantity, cart_id } = item;

                // 查询商品（行锁防并发超卖）
                const product = await Product.findByPk(product_id, { transaction: t, lock: t.LOCK.UPDATE });
                if (!product || product.status !== 1) {
                    await t.rollback();
                    throw new Error(`商品 ${product_id} 不存在或已下架`);
                }
                if (delivery_type === 'pickup' && !Number(product.supports_pickup)) {
                    await t.rollback();
                    throw new Error(`商品「${product.name}」不支持到店自提`);
                }
                orderProductIds.add(Number(product.id));
                if (product.category_id !== undefined && product.category_id !== null) {
                    orderCategoryIds.add(Number(product.category_id));
                }

                let price;
                let stockTarget = product;

                if (sku_id) {
                    const sku = await SKU.findOne({
                        where: { id: sku_id, product_id, status: 1 },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    if (!sku) {
                        await t.rollback();
                        throw new Error(`商品 ${product_id} 的规格 ${sku_id} 不存在`);
                    }
                    price = await PricingService.calculatePayableUnitPrice(product, sku, roleLevel, purchaseLevel);
                    stockTarget = sku;
                } else {
                    price = await PricingService.calculatePayableUnitPrice(product, null, roleLevel, purchaseLevel);
                }
                // 砍价单：用砍价价格覆盖，不再叠加折扣
                let slashRecord = null;
                if (slash_no) {
                    slashRecord = await SlashRecord.findOne({
                        where: { slash_no, user_id: userId, product_id },
                        include: [{ model: SlashActivity, as: 'activity' }],
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    if (!slashRecord) {
                        await t.rollback();
                        throw new Error('砍价记录不存在或不属于当前用户');
                    }
                    if (slashRecord.status === 'purchased') {
                        await t.rollback();
                        throw new Error('该砍价已购买过');
                    }
                    if (slashRecord.status === 'expired') {
                        await t.rollback();
                        throw new Error('砍价已过期');
                    }
                    if (!['active', 'success'].includes(slashRecord.status)) {
                        await t.rollback();
                        throw new Error('砍价状态异常');
                    }
                    if (slashRecord.activity && slashRecord.activity.sold_count >= slashRecord.activity.stock_limit) {
                        await t.rollback();
                        throw new Error('砍价活动库存已售罄');
                    }
                    price = parseFloat(slashRecord.current_price);
                    if (quantity !== 1) {
                        await t.rollback();
                        throw new Error('砍价商品每次只能购买1件');
                    }
                } else if (group_no) {
                    // 拼团单：用拼团价覆盖，不叠加折扣
                    const groupOrder = await GroupOrder.findOne({
                        where: { group_no },
                        include: [{ model: GroupActivity, as: 'activity' }],
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    if (!groupOrder) {
                        await t.rollback();
                        throw new Error('拼团不存在');
                    }
                    if (groupOrder.status !== 'success') {
                        await t.rollback();
                        throw new Error(groupOrder.status === 'open' ? '拼团尚未成团，请等待成团后再下单' : '拼团已结束');
                    }
                    const isMember = await GroupMember.findOne({
                        where: { group_order_id: groupOrder.id, user_id: userId, status: 'joined' },
                        transaction: t
                    });
                    if (!isMember) {
                        await t.rollback();
                        throw new Error('您不是该拼团的成员');
                    }
                    if (groupOrder.product_id !== product_id) {
                        await t.rollback();
                        throw new Error('商品与拼团活动不匹配');
                    }
                    if (groupOrder.activity && groupOrder.activity.sold_count >= groupOrder.activity.stock_limit) {
                        await t.rollback();
                        throw new Error('拼团活动库存已售罄');
                    }
                    const existingGroupOrder = await Order.findOne({
                        where: { buyer_id: userId, remark: { [Op.like]: `%group_no:${group_no}%` }, status: { [Op.notIn]: ['cancelled'] } },
                        transaction: t
                    });
                    if (existingGroupOrder) {
                        await t.rollback();
                        throw new Error('您已在该拼团中下过单');
                    }
                    price = parseFloat(groupOrder.group_price);
                    if (quantity !== 1) {
                        await t.rollback();
                        throw new Error('拼团商品每次只能购买1件');
                    }
                } else if (lsCtx) {
                    price = parseFloat(lsCtx.unit_price);
                    if (quantity !== 1) {
                        await t.rollback();
                        throw new Error('活动专享每次只能购买1件');
                    }
                }
                // 普品应付单价已在 calculatePayableUnitPrice 中乘 finalDiscountRate 等价系数，此处不再二次折扣

                // 库存校验
                if (stockTarget.stock < quantity) {
                    await t.rollback();
                    throw new Error(`商品「${product.name}」库存不足，当前仅剩 ${stockTarget.stock} 件`);
                }

                // 锁定发货扣款成本单价（优先商品成本价）
                // B端6折拿货：成本价 x 拿货折扣率（默认0.6），从后台agent_system_commission读取
                const baseCost = parseFloat(
                    product.cost_price
                    || product.price_agent
                    || product.price_leader
                    || product.price_member
                    || product.retail_price
                );
                // 拿货折扣率：从后台 agent_system_commission 配置读取，默认0.6
                let agentCostRate = 1;
                if (roleLevel >= 3) {
                    try {
                        const commCfg = await AppConfig.findOne({ where: { config_key: 'agent_system_commission', status: 1 } });
                        if (commCfg) {
                            const parsed = JSON.parse(commCfg.config_value);
                            agentCostRate = parseFloat(parsed.agent_cost_discount_rate || 0.6);
                        } else {
                            agentCostRate = 0.6;
                        }
                    } catch (_) { agentCostRate = 0.6; }
                }
                const lockedAgentCost = parseFloat((baseCost * agentCostRate).toFixed(2));

                // 拆单逻辑（代理商云库存判断）
                let agentQuantity = 0;
                let platformQuantity = quantity;

                if (agentId) {
                    const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                    if (agent && agent.role_level >= 3 && agent.stock_count > 0) {
                        // 代理商云仓发货：stock_count > 0 时优先从代理商发货
                        // 设为 Math.min(agent.stock_count, quantity) 即可启用代理商发货
                        // 当前策略：全部平台发货，待业务需要时开启
                        agentQuantity = 0;
                        platformQuantity = quantity - agentQuantity;
                    }
                }

                // 公共订单字段
                const commonFields = {
                    buyer_id: userId,
                    product_id,
                    sku_id: sku_id || null,
                    address_id: resolvedAddressId,
                    address_snapshot: addressSnapshot,
                    remark,
                    status: 'pending',
                    agent_id: agentId,
                    distributor_id: user.parent_id || null,
                    distributor_role: distributorRole,
                    locked_agent_cost: lockedAgentCost,
                    member_discount_rate: finalDiscountRate,
                    delivery_type,
                    pickup_station_id: delivery_type === 'pickup' ? pickup_station_id : null
                };

                // 价格倒挂保护
                if (agentQuantity > 0 && price < lockedAgentCost) {
                    await t.rollback();
                    throw new Error(`商品「${product.name}」价格倒挂，无法作为代理发货，请联系客服`);
                }

                // 扣减库存
                await stockTarget.decrement('stock', { by: quantity, transaction: t });
                if (sku_id) {
                    await product.decrement('stock', { by: quantity, transaction: t });
                }

                const itemOrders = [];

                if (agentQuantity > 0 && platformQuantity > 0) {
                    const parentOrder = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity: agentQuantity,
                        total_amount: price * agentQuantity,
                        actual_price: price * agentQuantity,
                        fulfillment_type: 'Agent_Pending',
                        platform_stock_deducted: 1,
                    }, { transaction: t });

                    const childOrder = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity: platformQuantity,
                        total_amount: price * platformQuantity,
                        actual_price: price * platformQuantity,
                        fulfillment_type: 'Company',
                        platform_stock_deducted: 1,
                        parent_order_id: parentOrder.id,
                    }, { transaction: t });

                    itemOrders.push(parentOrder, childOrder);
                } else if (agentQuantity > 0) {
                    const order = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity,
                        total_amount: price * quantity,
                        actual_price: price * quantity,
                        fulfillment_type: 'Agent_Pending',
                        platform_stock_deducted: 1,
                    }, { transaction: t });
                    itemOrders.push(order);
                } else {
                    const order = await Order.create({
                        ...commonFields,
                        order_no: generateOrderNo(),
                        quantity,
                        total_amount: price * quantity,
                        actual_price: price * quantity,
                        fulfillment_type: 'Company',
                        platform_stock_deducted: 1,
                    }, { transaction: t });
                    itemOrders.push(order);
                }

                // 删除对应购物袋项
                if (cart_id) {
                    await Cart.destroy({ where: { id: cart_id, user_id: userId }, transaction: t });
                }

                allOrders.push(...itemOrders);
                totalAmountSum += price * quantity;
            }

            // 包邮策略：自提不收运费；快递按策略
            const shippingFee =
                delivery_type === 'pickup' ? 0 : calcShippingFeeByPolicy(commercePolicy, addressSnapshot);
            if (shippingFee > 0 && allOrders.length > 0) {
                const rootOrders = allOrders.filter(o => !o.parent_order_id);
                const firstOrder = rootOrders[0] || allOrders[0];
                firstOrder.shipping_fee = shippingFee;
                firstOrder.total_amount = parseFloat(firstOrder.total_amount) + shippingFee;
                firstOrder.actual_price = parseFloat(firstOrder.actual_price) + shippingFee;
                await firstOrder.save({ transaction: t });
                totalAmountSum += shippingFee;
            }

            // ★ 优惠券抵扣（整单级别；适用商品/分类与 getAvailableCoupons 一致，由 isCouponApplicable 判定）
            let couponDiscount = 0;
            let appliedUserCoupon = null;
            if (user_coupon_id) {
                const uc = await UserCoupon.findOne({
                    where: { id: user_coupon_id, user_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                if (!uc) {
                    await t.rollback();
                    throw new Error('优惠券不存在或不属于当前用户');
                }
                if (uc.status !== 'unused') {
                    await t.rollback();
                    throw new Error('优惠券已使用或已过期');
                }
                if (new Date(uc.expire_at) < new Date()) {
                    await t.rollback();
                    throw new Error('优惠券已过期');
                }
                if (parseFloat(uc.min_purchase) > totalAmountSum) {
                    await t.rollback();
                    throw new Error(`订单金额未满足优惠券最低消费 ${uc.min_purchase} 元`);
                }
                if (!isCouponApplicable(uc, {
                    productIds: Array.from(orderProductIds),
                    categoryIds: Array.from(orderCategoryIds)
                })) {
                    await t.rollback();
                    throw new Error('优惠券不适用于当前商品');
                }
                couponDiscount = calcCouponDiscount(uc, totalAmountSum);
                appliedUserCoupon = uc;
            }

            // 将优惠券信息写入首个主订单（单商品场景）或按比例分摊到各订单（多商品）
            // 当前策略：将折扣信息记录在第一个非子订单上，total_amount 减去折扣
            if (couponDiscount > 0 && allOrders.length > 0) {
                // 找出所有根订单（无 parent_order_id 的）
                const rootOrders = allOrders.filter(o => !o.parent_order_id);
                if (rootOrders.length === 1) {
                    // 单根订单：全额抵扣
                    const o = rootOrders[0];
                    o.coupon_id = appliedUserCoupon.id;
                    o.coupon_discount = couponDiscount;
                    o.total_amount = Math.max(0, parseFloat(o.total_amount) - couponDiscount).toFixed(2);
                    o.actual_price = Math.max(0, parseFloat(o.actual_price) - couponDiscount).toFixed(2);
                    await o.save({ transaction: t });
                } else {
                    // 多根订单：按各订单金额比例分摊折扣
                    const rootTotal = rootOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
                    let remainDiscount = couponDiscount;
                    for (let i = 0; i < rootOrders.length; i++) {
                        const o = rootOrders[i];
                        const ratio = parseFloat(o.total_amount) / rootTotal;
                        const share = i < rootOrders.length - 1
                            ? parseFloat((couponDiscount * ratio).toFixed(2))
                            : remainDiscount; // 最后一个收尾，避免浮点累计误差
                        remainDiscount = parseFloat((remainDiscount - share).toFixed(2));
                        o.coupon_id = appliedUserCoupon.id;
                        o.coupon_discount = share;
                        o.total_amount = Math.max(0, parseFloat(o.total_amount) - share).toFixed(2);
                        o.actual_price = Math.max(0, parseFloat(o.actual_price) - share).toFixed(2);
                        await o.save({ transaction: t });
                    }
                }

                // 标记优惠券为已使用
                appliedUserCoupon.status = 'used';
                appliedUserCoupon.used_at = new Date();
                await appliedUserCoupon.save({ transaction: t });
            }

            // ★ 积分抵扣（在优惠券之后）
            if (points_to_use > 0) {
                const { PointAccount } = require('../models');
                const pointAccount = await PointAccount.findOne({ where: { user_id: userId }, transaction: t, lock: t.LOCK.UPDATE });
                if (pointAccount && pointAccount.balance_points > 0) {
                    const afterCouponTotal = allOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
                    const maxDeductPoints = Math.floor(afterCouponTotal * 0.5 / 0.01);
                    const actualPoints = Math.min(points_to_use, pointAccount.balance_points, maxDeductPoints);
                    const pointsDiscount = parseFloat((actualPoints * 0.01).toFixed(2));

                    if (actualPoints > 0 && pointsDiscount > 0) {
                        await PointService.addPoints(userId, -actualPoints, 'deduct', null, '下单积分抵扣', t);

                        const rootOrders = allOrders.filter(o => !o.parent_order_id);
                        if (rootOrders.length === 1) {
                            rootOrders[0].points_used = actualPoints;
                            rootOrders[0].points_discount = pointsDiscount;
                            rootOrders[0].total_amount = Math.max(0, parseFloat(rootOrders[0].total_amount) - pointsDiscount).toFixed(2);
                            rootOrders[0].actual_price = Math.max(0, parseFloat(rootOrders[0].actual_price) - pointsDiscount).toFixed(2);
                            await rootOrders[0].save({ transaction: t });
                        } else {
                            const rootTotal = rootOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
                            let remainDiscount = pointsDiscount;
                            let remainPoints = actualPoints;
                            for (let i = 0; i < rootOrders.length; i++) {
                                const o = rootOrders[i];
                                const ratio = parseFloat(o.total_amount) / rootTotal;
                                const share = i < rootOrders.length - 1
                                    ? parseFloat((pointsDiscount * ratio).toFixed(2))
                                    : remainDiscount;
                                const sharePoints = i < rootOrders.length - 1
                                    ? Math.round(actualPoints * ratio)
                                    : remainPoints;
                                remainDiscount = parseFloat((remainDiscount - share).toFixed(2));
                                remainPoints -= sharePoints;
                                o.points_used = sharePoints;
                                o.points_discount = share;
                                o.total_amount = Math.max(0, parseFloat(o.total_amount) - share).toFixed(2);
                                o.actual_price = Math.max(0, parseFloat(o.actual_price) - share).toFixed(2);
                                await o.save({ transaction: t });
                            }
                        }
                    }
                }
            }

            // 砍价订单：标记砍价记录为已购买，更新活动售出数
            if (slash_no) {
                const sr = await SlashRecord.findOne({ where: { slash_no }, transaction: t, lock: t.LOCK.UPDATE });
                if (sr) {
                    await sr.update({ status: 'purchased', purchased_at: new Date() }, { transaction: t });
                    await SlashActivity.increment('sold_count', { where: { id: sr.activity_id }, transaction: t });
                }
            }

            // 拼团订单：标记成员为已购买
            if (group_no) {
                const go = await GroupOrder.findOne({ where: { group_no }, transaction: t });
                if (go) {
                    await GroupMember.update(
                        { status: 'purchased' },
                        { where: { group_order_id: go.id, user_id: userId }, transaction: t }
                    );
                    // 在订单备注中记录拼团关联
                    for (const o of allOrders) {
                        if (!o.parent_order_id) {
                            o.remark = [o.remark, `group_no:${group_no}`].filter(Boolean).join(' | ');
                            await o.save({ transaction: t });
                        }
                    }
                }
            }

            // 限时活动专享：占名额、积分兑换扣积分
            if (lsCtx) {
                for (const o of allOrders) {
                    if (!o.parent_order_id) {
                        o.remark = [o.remark, lsCtx.remarkToken].filter(Boolean).join(' | ');
                        await o.save({ transaction: t });
                    }
                }
                await LimitedSpotService.incrementSold(t, lsCtx.card_id, lsCtx.offer_id, lsCtx.stock_limit);
                if (lsCtx.redeem_points) {
                    await PointService.addPoints(
                        userId,
                        -lsCtx.points_cost,
                        'limited_spot',
                        lsCtx.offer_key,
                        '限时活动积分兑换',
                        t
                    );
                }
            }

            await t.commit();

            logOrder('订单创建', {
                userId,
                orderIds: allOrders.map(o => o.id),
                orderNos: allOrders.map(o => o.order_no),
                totalAmount: totalAmountSum,
                itemCount: items.length,
                splitOrders: allOrders.length > items.length,
            });

            // 返回：单商品返回对象，多商品或拆单返回数组
            const returnData = allOrders.length === 1 ? allOrders[0] : allOrders;
            return { data: returnData, message: items.length > 1 ? `订单创建成功，共 ${items.length} 件商品` : '订单创建成功' };
        } catch (error) {
            await t.rollback();
            logError('ORDER', '创建订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            console.error('创建订单失败:', error);
            throw new Error('创建订单失败');
        }
    };

    /**
     * 预下单（统一下单）：生成 wx.requestPayment() 所需参数
     * POST /api/orders/:id/prepay
     */

    static async prepayOrder(req) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const useWalletBalance = req.body?.use_wallet_balance === true;

            const order = await Order.findOne({ where: { id, buyer_id: userId } });
            if (!order) throw new Error('订单不存在');
            if (order.status !== 'pending') throw new Error('订单状态不正确，无法发起支付');

            const user = await User.findByPk(userId, { attributes: ['id', 'openid', 'role_level'] });
            if (!user || !user.openid) throw new Error('用户 openid 缺失，请重新登录后重试');

            const orderAmount = parseFloat(order.total_amount);

            // 零元订单（优惠券/积分抵扣后为0）直接标记已支付
            if (orderAmount <= 0) {
                const t = await sequelize.transaction();
                try {
                    order.payment_method = 'free';
                    await order.save({ transaction: t });
                    await _markOrderAsPaid(order, t);
                    await t.commit();
                    return { data: { paid_by_free: true, amount: 0, message: '订单金额为0，已自动完成支付' } };
                } catch (e) {
                    if (!t.finished) await t.rollback();
                    throw e;
                }
            }

            let walletFallbackInfo = null;

            // B端合伙人可使用货款余额支付
            if (useWalletBalance && user.role_level >= 3) {
                const { AgentWalletAccount, AgentWalletLog } = require('../models');
                const t = await sequelize.transaction();
                try {
                    const account = await AgentWalletAccount.findOne({
                        where: { user_id: userId },
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    const walletBalance = account ? parseFloat(account.balance || 0) : 0;

                    if (walletBalance >= orderAmount) {
                        // 货款余额充足：全额扣除，订单直接标记已支付
                        const newBalance = parseFloat((walletBalance - orderAmount).toFixed(2));
                        account.balance = newBalance;
                        await account.save({ transaction: t });

                        await AgentWalletLog.create({
                            account_id: account.id,
                            change_type: 'deduct',
                            amount: -orderAmount,
                            balance_before: walletBalance,
                            balance_after: newBalance,
                            ref_type: 'order_payment',
                            ref_id: order.order_no,
                            remark: `货款余额支付订单 ${order.order_no}`
                        }, { transaction: t });

                        order.payment_method = 'wallet';
                        await order.save({ transaction: t });
                        await _markOrderAsPaid(order, t);
                        await t.commit();

                        return { data: { paid_by_wallet: true, amount: orderAmount, message: '货款余额支付成功' } };
                    } else {
                        await t.rollback();
                        // 余额不足，返回提示让前端走微信支付
                        // 暂不支持混合支付，全额走微信
                        walletFallbackInfo = {
                            wallet_balance_insufficient: true,
                            wallet_balance: walletBalance,
                            order_amount: orderAmount
                        };
                    }
                } catch (e) {
                    if (!t.finished) await t.rollback();
                    throw e;
                }
            }

            const productRow = await Product.findByPk(order.product_id, { attributes: ['name'] });
            const payDescription = buildWxJsapiShoppingDescription(order, productRow?.name);

            // 微信支付（out_trade_no=order_no；description 同步到「小程序购物订单」）
            const prepayId = await createUnifiedOrder({
                orderNo: order.order_no,
                amount: orderAmount,
                openid: user.openid,
                body: payDescription
            });

            const jsApiParams = buildJsApiParams(prepayId);
            return { data: { ...jsApiParams, ...(walletFallbackInfo || {}) } };
        } catch (error) {
            logError('ORDER', '预下单失败', { error: error.message, userId: req.user?.id, orderId: req.params?.id });
            console.error('预下单失败:', error);
            throw new Error(error.message || '预下单失败');
        }
    };

    /**
     * 微信支付回调（notify）
     * POST /wechat/pay/notify  ← 无需鉴权，由签名验证保障安全
     * 请求体格式：application/json（V3），原始报文由 app.js 预先写入 req.rawBody
     */

    static async wechatPayNotify(req) {
        // ★ 注意：V3 必须按 JSON 协议应答，不能再回 XML
        try {
            const rawBody = req.rawBody
                || (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null)
                || (typeof req.body === 'string' ? req.body : null);

            if (!rawBody) {
                return { json_fail: 'empty body', statusCode: 400 };
            }

            if (!await verifyNotifySign(req.headers, rawBody)) {
                console.error('[WechatNotify] 签名验证失败');
                return { json_fail: 'sign error', statusCode: 401 };
            }

            const parsed = JSON.parse(rawBody);
            const notifyData = decryptNotifyResource(parsed.resource);

            if (notifyData.trade_state !== 'SUCCESS') {
                console.error('[WechatNotify] 支付失败:', notifyData.trade_state_desc || notifyData.trade_state);
                return { json_success: true };
            }

            const orderNo = notifyData.out_trade_no;
            const paidFee = parseInt(notifyData.amount && notifyData.amount.total, 10);
            if (!orderNo || isNaN(paidFee) || paidFee <= 0) {
                console.error('[WechatNotify] 关键字段缺失或异常:', { orderNo, paidFee });
                return { json_fail: 'invalid notify data', statusCode: 400 };
            }

            // ── 货款充值单（WR 前缀）──────────────────────────────
            if (orderNo && orderNo.startsWith('WR')) {
                const t = await sequelize.transaction();
                try {
                    // 幂等：已处理的 pending 记录不重复入账
                    const pending = await AgentWalletLog.findOne({
                        where: { ref_id: orderNo, change_type: 'recharge_pending' },
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    if (!pending) {
                        await t.rollback();
                        console.warn('[WechatNotify] 货款充值单 pending 记录不存在，可能已处理:', orderNo);
                        return { json_success: true };
                    }

                    const rechargeAmount = parseFloat(pending.amount);
                    const expectedFee = Math.round(rechargeAmount * 100);
                    if (Math.abs(paidFee - expectedFee) > 1) {
                        await t.rollback();
                        console.error(`[WechatNotify] 货款充值金额不一致: 预期${expectedFee}分, 实收${paidFee}分, 单号${orderNo}`);
                        return { json_fail: 'amount mismatch', statusCode: 400 };
                    }

                    await AgentWalletService.recharge({
                        userId: pending.user_id,
                        amount: rechargeAmount,
                        refType: 'wx_recharge',
                        refId: orderNo,
                        remark: `微信支付充值 ¥${rechargeAmount.toFixed(2)}`
                    }, t);

                    // 删除 pending 记录（已被正式流水替代）
                    await pending.destroy({ transaction: t });
                    await t.commit();
                    console.log(`[WechatNotify] 货款充值成功: ${orderNo} ¥${rechargeAmount}`);

                    // 异步发放充值满赠奖励
                    setImmediate(async () => {
                        try {
                            const cfgRow = await AppConfig.findOne({ where: { config_key: 'agent_system_recharge_config', status: 1 } });
                            if (!cfgRow?.config_value) return;
                            const cfg = JSON.parse(cfgRow.config_value);
                            if (!cfg.bonus_enabled || !Array.isArray(cfg.bonus_tiers) || !cfg.bonus_tiers.length) return;
                            const sorted = cfg.bonus_tiers.sort((a, b) => b.min - a.min);
                            const matched = sorted.find(tier => rechargeAmount >= tier.min);
                            if (!matched || !matched.bonus || matched.bonus <= 0) return;
                            await AgentWalletService.recharge({
                                userId: pending.user_id,
                                amount: matched.bonus,
                                refType: 'recharge_bonus',
                                refId: orderNo,
                                remark: `充值满赠：充 ¥${rechargeAmount} 送 ¥${matched.bonus}`
                            });
                            console.log(`[满赠] 用户${pending.user_id} 充 ¥${rechargeAmount} 送 ¥${matched.bonus}`);
                        } catch (e) {
                            console.error('[满赠] 发放失败:', e.message);
                        }
                    });

                    return { json_success: true };
                } catch (innerErr) {
                    await t.rollback();
                    console.error('[WechatNotify] 货款充值事务失败:', innerErr);
                    return { json_fail: 'server error', statusCode: 500 };
                }
            }

            // ── 升级缴费单（UP 前缀）──────────────────────────────
            if (orderNo && orderNo.startsWith('UP')) {
                try {
                    const { UpgradeApplication } = require('../models');
                    const app = await UpgradeApplication.findOne({ where: { payment_no: orderNo } });
                    if (!app || app.status !== 'pending_payment') {
                        console.warn('[WechatNotify] 升级单已处理或不存在:', orderNo);
                        return { json_success: true };
                    }

                    const expectedFee = Math.round(parseFloat(app.amount) * 100);
                    if (Math.abs(paidFee - expectedFee) > 1) {
                        console.error(`[WechatNotify] 升级缴费金额不一致: 预期${expectedFee}分, 实收${paidFee}分, 单号${orderNo}`);
                        return { json_fail: 'amount mismatch', statusCode: 400 };
                    }

                    const ut = await sequelize.transaction();
                    try {
                        app.status = 'pending_review';
                        await app.save({ transaction: ut });

                        await AgentWalletService.recharge({
                            userId: app.user_id,
                            amount: parseFloat(app.amount),
                            refType: 'upgrade_payment',
                            refId: String(app.id),
                            remark: `升级缴费 ¥${app.amount}`
                        }, ut);

                        await ut.commit();
                        console.log(`[WechatNotify] 升级缴费成功: ${orderNo} ¥${app.amount}`);

                        const { sendNotification } = require('../models/notificationUtil');
                        sendNotification(app.user_id, '升级缴费成功',
                            `您的 ¥${app.amount} 已充入货款钱包，升级申请正在等待审核。`,
                            'upgrade', String(app.id)).catch(() => {});
                    } catch (e) {
                        if (!ut.finished) await ut.rollback();
                        throw e;
                    }
                    return { json_success: true };
                } catch (err) {
                    console.error('[WechatNotify] 升级缴费处理失败:', err.message);
                    return { json_fail: 'server error', statusCode: 500 };
                }
            }

            // ── 普通商品订单 ────────────────────────────────────────
            const t = await sequelize.transaction();
            try {
                const order = await Order.findOne({
                    where: { order_no: orderNo },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });

                if (!order) {
                    await t.rollback();
                    console.error('[WechatNotify] 订单不存在:', orderNo);
                    return { json_fail: 'order not found', statusCode: 404 };
                }

                // 幂等处理：已支付则直接返回成功
                if (order.status !== 'pending') {
                    await t.rollback();
                    return { json_success: true };
                }

                // 金额一致性校验（误差容忍 1 分，防止浮点精度问题）
                const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
                if (Math.abs(paidFee - expectedFee) > 1) {
                    await t.rollback();
                    console.error(`[WechatNotify] 金额不一致: 预期${expectedFee}分, 实收${paidFee}分, 订单${orderNo}`);
                    return { json_fail: 'amount mismatch', statusCode: 400 };
                }

                order.payment_method = 'wechat';
                await order.save({ transaction: t });
                await _markOrderAsPaid(order, t);
                await t.commit();

                console.log(`[WechatNotify] 订单支付成功: ${orderNo}`);

                const paidOrderId = order.id;
                const notifySnap = {
                    out_trade_no: notifyData.out_trade_no,
                    transaction_id: notifyData.transaction_id,
                    mchid: notifyData.mchid,
                    payer: notifyData.payer
                };
                scheduleShoppingOrderUploadAfterWechatPay(paidOrderId, notifySnap);

                return { json_success: true };
            } catch (innerErr) {
                await t.rollback();
                console.error('[WechatNotify] 事务失败:', innerErr);
                return { json_fail: 'server error', statusCode: 500 };
            }
        } catch (error) {
            console.error('[WechatNotify] 处理异常:', error);
            return { json_fail: 'server error', statusCode: 500 };
        }
    };

    /**
     * 待付款订单：请求微信支付查单并落库（弥补 notify 未达、验签失败、公网不可达等导致的 pending 悬挂）
     * 仅买家本人可调用；已非 pending 时直接返回。
     */
    static async syncPendingOrderWechatPay(req) {
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) {
            throw new Error('订单参数无效');
        }

        const order = await Order.findOne({
            where: { id, buyer_id: userId }
        });
        if (!order) {
            throw new Error('订单不存在');
        }
        if (order.status !== 'pending') {
            return { data: { synced: false, status: order.status } };
        }

        let wxData;
        try {
            wxData = await queryJsapiOrderByOutTradeNo(order.order_no);
        } catch (e) {
            const st = e.response && e.response.status;
            if (st === 404) {
                console.warn(`[SyncWechatPay] 微信无此单号: ${order.order_no}`);
                return { data: { synced: false, message: '微信侧暂无该支付单' } };
            }
            console.error('[SyncWechatPay] 微信查单失败:', e.message);
            throw new Error('查询微信支付状态失败，请稍后重试');
        }

        if (!wxData || wxData.trade_state !== 'SUCCESS') {
            return {
                data: {
                    synced: false,
                    trade_state: wxData ? wxData.trade_state : null
                }
            };
        }

        const paidFee = parseInt(wxData.amount && wxData.amount.total, 10);
        const expectedFee = Math.round(parseFloat(order.total_amount) * 100);
        if (!paidFee || Number.isNaN(paidFee) || Math.abs(paidFee - expectedFee) > 1) {
            console.error(`[SyncWechatPay] 金额不一致: 预期${expectedFee}分, 微信${paidFee}分, 订单${order.order_no}`);
            throw new Error('支付金额与订单不一致，请联系客服处理');
        }

        const t = await sequelize.transaction();
        try {
            const locked = await Order.findOne({
                where: { id: order.id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!locked || locked.status !== 'pending') {
                await t.rollback();
                return { data: { synced: false, status: locked && locked.status } };
            }

            locked.payment_method = 'wechat';
            await locked.save({ transaction: t });
            await _markOrderAsPaid(locked, t);
            await t.commit();

            console.log(`[SyncWechatPay] 主动同步成功: ${order.order_no}`);

            const notifySnap = {
                out_trade_no: wxData.out_trade_no || order.order_no,
                transaction_id: wxData.transaction_id,
                mchid: wxData.mchid,
                payer: wxData.payer
            };
            scheduleShoppingOrderUploadAfterWechatPay(locked.id, notifySnap);

            return { data: { synced: true } };
        } catch (innerErr) {
            await t.rollback();
            console.error('[SyncWechatPay] 事务失败:', innerErr);
            throw innerErr;
        }
    }

    static async payOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, buyer_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (order.status !== 'pending') {
                await t.rollback();
                throw new Error('订单状态不正确');
            }

            let allOrders;
            try {
                const result = await _markOrderAsPaid(order, t);
                allOrders = [result.order, ...result.childOrders];
            } catch (innerErr) {
                await t.rollback();
                throw new Error(innerErr.message);
            }

            await t.commit();

            return { data: allOrders.length === 1 ? allOrders[0] : allOrders, message: '支付成功' };
        } catch (error) {
            await t.rollback();
            logError('ORDER', '支付订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id,
                orderId: req.params?.id
            });
            console.error('支付订单失败:', error);
            throw new Error('支付失败');
        }
    };


    static async _completeShippedOrder(order, transaction, extraRemark = '') {
        order.status = 'completed';
        order.completed_at = new Date();

        // 设置售后期结束时间，确保用户确认收货与后台强制完成走同一条佣金链路
        const refundDays = constants.REFUND?.MAX_REFUND_DAYS || constants.COMMISSION.FREEZE_DAYS;
        const refundDeadline = new Date();
        refundDeadline.setDate(refundDeadline.getDate() + refundDays);
        order.settlement_at = refundDeadline;

        if (extraRemark) {
            order.remark = (order.remark || '') + extraRemark;
        }

        await order.save({ transaction });

        await CommissionLog.update(
            { refund_deadline: refundDeadline },
            { where: { order_id: order.id, status: 'frozen' }, transaction }
        );

        return { refundDeadline, refundDays };
    }

    static async confirmOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, buyer_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }
            if (order.status !== 'shipped') {
                await t.rollback();
                throw new Error('订单状态不正确');
            }

            const { refundDays } = await this._completeShippedOrder(order, t);

            await t.commit();

            return { message: `确认收货成功！售后期${refundDays}天后，佣金将进入审批流程。` };
        } catch (error) {
            await t.rollback();
            console.error('确认收货失败:', error);
            throw new Error('确认收货失败');
        }
    };

    static async forceCompleteOrderByAdmin(id, adminName, reason) {
        const t = await sequelize.transaction();
        try {
            const order = await Order.findByPk(id, {
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }
            if (order.status !== 'shipped') {
                await t.rollback();
                throw new Error('仅已发货订单可以强制完成');
            }

            const { refundDays } = await this._completeShippedOrder(
                order,
                t,
                ` [管理员${adminName}强制完成 原因:${reason}]`
            );

            await t.commit();

            return { refundDays };
        } catch (error) {
            await t.rollback();
            console.error('后台强制完成订单失败:', error);
            throw error;
        }
    }



    static async agentConfirmOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            // ★ 事务 + 行锁，防止并发竞态
            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) {
                await t.rollback();
                throw new Error('订单不存在或您无权操作');
            }
            if (order.status !== 'paid') {
                await t.rollback();
                throw new Error('订单需为已支付状态');
            }

            order.status = 'agent_confirmed';
            order.agent_confirmed_at = new Date();
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '代理人已确认订单' };
        } catch (error) {
            await t.rollback();
            console.error('代理人确认订单失败:', error);
            throw new Error('确认失败');
        }
    };


    static async requestShipping(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const { tracking_no } = req.body;

            // ★ 事务 + 行锁
            const order = await Order.findOne({
                where: { id, agent_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!order) throw new Error('订单不存在或您无权操作');
            // 代理商确认为可选：允许 paid 直接申请发货
            if (!['paid', 'agent_confirmed'].includes(order.status)) {
                throw new Error('订单状态不允许申请发货');
            }

            // 锁住代理商行，确保同一代理并发发货时资金/状态一致
            await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

            // 若未确认，记录一次自动确认时间（用于审计，不阻塞流程）
            if (!order.agent_confirmed_at) {
                order.agent_confirmed_at = new Date();
            }

            order.status = 'shipping_requested';
            order.shipping_requested_at = new Date();
            order.tracking_no = tracking_no || null;
            order.fulfillment_partner_id = userId;
            await order.save({ transaction: t });
            await t.commit();

            return { data: order, message: '已申请发货，等待后台确认' };
        } catch (error) {
            await t.rollback();
            console.error('申请发货失败:', error);
            throw new Error('申请失败');
        }
    };



    static async cancelOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const { id } = req.params;

            const order = await Order.findOne({
                where: { id, buyer_id: userId },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            // 允许从子订单入口取消：统一按主订单维度取消整组
            const rootOrder = order.parent_order_id
                ? await Order.findOne({
                    where: { id: order.parent_order_id, buyer_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                })
                : order;

            if (!rootOrder) {
                await t.rollback();
                throw new Error('主订单不存在');
            }

            if (rootOrder.status !== 'pending') {
                await t.rollback();
                throw new Error('仅待付款订单可取消');
            }

            // ★ 查找子订单（拆单场景）
            const childOrders = await Order.findAll({
                where: { parent_order_id: rootOrder.id, status: 'pending' },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            // ★★★ 修复库存双重恢复：计算总恢复量 = 主订单数量 + 所有子订单数量
            // createOrder 中是按整单(quantity)一次性扣减平台库存的，
            // 所以恢复时也必须只恢复一次总量，不能主+子各恢复一次
            const totalRestoreQty = rootOrder.quantity + childOrders.reduce((sum, c) => sum + c.quantity, 0);

            const product = await Product.findByPk(rootOrder.product_id, { transaction: t });
            if (product) {
                await product.increment('stock', { by: totalRestoreQty, transaction: t });
            }
            if (rootOrder.sku_id) {
                const sku = await SKU.findByPk(rootOrder.sku_id, { transaction: t });
                if (sku) {
                    await sku.increment('stock', { by: totalRestoreQty, transaction: t });
                }
            }

            // 取消订单组
            rootOrder.status = 'cancelled';
            await rootOrder.save({ transaction: t });

            // 同步取消子订单（不再重复恢复库存）
            for (const child of childOrders) {
                child.status = 'cancelled';
                await child.save({ transaction: t });
            }

            // 回滚优惠券与积分（仅待支付取消场景）
            const orderGroup = [rootOrder, ...childOrders];
            const couponId = orderGroup.map(o => o.coupon_id).find(Boolean);
            if (couponId) {
                const uc = await UserCoupon.findOne({
                    where: { id: couponId, user_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                if (uc && uc.status === 'used') {
                    uc.status = 'unused';
                    uc.used_at = null;
                    uc.used_order_id = null;
                    await uc.save({ transaction: t });
                }
            }

            const pointsToRestore = orderGroup.reduce((sum, o) => sum + (parseInt(o.points_used, 10) || 0), 0);
            if (pointsToRestore > 0) {
                await PointService.addPoints(
                    userId,
                    pointsToRestore,
                    'refund',
                    `order_cancel_${rootOrder.id}`,
                    '取消订单退回积分',
                    t
                );
            }

            await LimitedSpotService.onOrderPendingCancelled(rootOrder, userId, t);

            await t.commit();
            return { message: '订单已取消' };
        } catch (error) {
            await t.rollback();
            console.error('取消订单失败:', error);
            throw new Error('取消订单失败');
        }
    };


    static async shipOrder(req) {
        const t = await sequelize.transaction();
        try {
            const { id } = req.params;
            const { fulfillment_type, tracking_no } = req.body;
            // fulfillment_type: 'agent'（代理商发） 或 'platform'（平台发）

            const order = await Order.findOne({
                where: { id },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!order) {
                await t.rollback();
                throw new Error('订单不存在');
            }

            if (!['paid', 'agent_confirmed', 'shipping_requested'].includes(order.status)) {
                await t.rollback();
                throw new Error('当前订单状态不允许发货');
            }

            // ★★★ 安全修复：发货类型应从订单状态推断，而不是信任前端参数
            // 订单已有 fulfillment_type 标记（创建订单时设置），根据它来判断
            // - Agent_Pending / Agent：代理商发货
            // - Company / Platform / null：平台发货
            // 如果前端传了参数且与订单标记不一致，以订单标记为准
            let actualFulfillmentType = 'platform'; // 默认平台发
            if (order.fulfillment_type && ['Agent_Pending', 'Agent'].includes(order.fulfillment_type)) {
                actualFulfillmentType = 'agent';
            }
            // 仅当订单没有明确标记时，才参考前端参数（兼容旧数据）
            if (!order.fulfillment_type && fulfillment_type === 'agent' && order.agent_id) {
                actualFulfillmentType = 'agent';
            }

            if (actualFulfillmentType === 'agent') {
                // ==================== 代理商发货 ====================
                const agentId = order.agent_id;
                if (!agentId) {
                    await t.rollback();
                    throw new Error('该订单没有归属代理商');
                }

                const agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                if (!agent || agent.role_level < 3) {
                    await t.rollback();
                    throw new Error('代理商信息异常');
                }

                order.fulfillment_type = 'Agent';
                order.fulfillment_partner_id = agentId;

                // ★★★ 核心：代理商发货 → 调用统一方法计算级差佣金 + 代理商发货利润
                //   原先 110 行重复逻辑已提取到 CommissionService.calculateGapAndFulfillmentCommissions
                const buyer = await User.findByPk(order.buyer_id, { transaction: t });
                const orderProduct = await Product.findByPk(order.product_id, { transaction: t });

                if (orderProduct && buyer) {
                    await CommissionService.calculateGapAndFulfillmentCommissions({
                        order,
                        buyer,
                        product: orderProduct,
                        agentId,
                        transaction: t,
                        notifySource: '平台代发(代理商)'
                    });
                }
            } else {
                // ==================== 平台发货 ====================
                // ★ 平台/工厂直发，利润归平台，团队不产生任何佣金
                order.fulfillment_type = 'Company';
                order.middle_commission_total = 0;
            }

            order.status = 'shipped';
            order.shipped_at = new Date();
            order.tracking_no = tracking_no || null;
            await order.save({ transaction: t });

            await t.commit();

            return { data: order, message: '发货成功' };
        } catch (error) {
            await t.rollback();
            console.error('发货失败:', error);
            throw new Error('发货失败');
        }
    };


}
module.exports = OrderCoreService;
