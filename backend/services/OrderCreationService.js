/**
 * OrderCreationService — 订单创建主流程
 * 从 OrderCoreService.createOrder (L268-905) 提取，包含完整的下单逻辑
 */
const { Order, Product, SKU, User, Cart, Address, SlashRecord, SlashActivity, GroupActivity, GroupOrder, GroupMember, ServiceStation, AppConfig, PointAccount, UserCoupon, sequelize } = require('../models');
const { Op } = require('sequelize');
const constants = require('../config/constants');
const { logOrder, error: logError } = require('../utils/logger');
const PointService = require('./PointService');
const LimitedSpotService = require('./LimitedSpotService');
const MemberTierService = require('./MemberTierService');
const PricingService = require('./PricingService');
const { calcCouponDiscount, isCouponApplicable, getEffectiveMinPurchase } = require('./CouponCalcService');
const { normalizeSkuIdForFk } = require('../utils/skuId');
const { generateOrderNo, calcShippingFeeByPolicy } = require('./OrderCalcService');

class OrderCreationService {
    static getProductSupplyPriceForRole(product, roleLevel) {
        if (!product || !roleLevel) return null;
        const fieldMap = {
            [constants.ROLES.AGENT]: 'supply_price_b1',
            [constants.ROLES.PARTNER]: 'supply_price_b2',
            [constants.ROLES.REGIONAL]: 'supply_price_b3'
        };
        const field = fieldMap[roleLevel];
        if (!field) return null;
        const value = product[field];
        const parsed = value === null || value === undefined || value === '' ? NaN : Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    static getAgentLevelLabel(roleLevel) {
        return constants.ROLE_NAMES?.[roleLevel] || '代理商';
    }

    static async rollbackWithError(transaction, message) {
        await transaction.rollback();
        throw new Error(message);
    }

    static parseCreatePayload(body) {
        return {
            addressId: body.address_id,
            deliveryType: body.delivery_type === 'pickup' ? 'pickup' : 'express',
            pickupStationId: body.pickup_station_id ? parseInt(body.pickup_station_id, 10) : null,
            remark: body.remark,
            userCouponId: body.user_coupon_id || null,
            pointsToUse: parseInt(body.points_to_use, 10) || 0,
            slashNo: body.slash_no || null,
            groupNo: body.group_no || null,
            limitedSpot: body.limited_spot || null
        };
    }

    static normalizeCreateItems(body) {
        let items = body.items;

        if (!items || !Array.isArray(items) || items.length === 0) {
            const { product_id: pid, sku_id: sid, quantity: qty, cart_id: cid } = body;
            if (!pid || !qty || qty < 1) {
                throw new Error('缺少必要参数（product_id/quantity 或 items[]）');
            }
            items = [{ product_id: pid, sku_id: sid, quantity: qty, cart_id: cid }];
        }

        return items.map((item) => ({
            ...item,
            sku_id: normalizeSkuIdForFk(item.sku_id)
        }));
    }

    static async resolveLimitedSpotContext({ limitedSpot, items }) {
        if (!limitedSpot || !limitedSpot.card_id || !limitedSpot.offer_id || items.length !== 1) {
            return null;
        }

        return LimitedSpotService.resolveCreateContext({
            card_id: limitedSpot.card_id,
            offer_id: limitedSpot.offer_id,
            redeem_points: !!limitedSpot.redeem_points,
            product_id: items[0].product_id,
            sku_id: items[0].sku_id
        });
    }

    static async validatePromotionExclusivity({
        transaction,
        limitedSpotContext,
        userCouponId,
        pointsToUse,
        slashNo,
        groupNo
    }) {
        if (!limitedSpotContext) {
            return;
        }

        if (userCouponId || pointsToUse > 0) {
            await this.rollbackWithError(transaction, '活动专享单不支持叠加优惠券或积分抵扣');
        }

        if (slashNo || groupNo) {
            await this.rollbackWithError(transaction, '活动专享单不能与砍价/拼团同时使用');
        }
    }

    static async buildUserOrderContext({ userId, transaction }) {
        const user = await User.findByPk(userId, { transaction });
        const roleLevel = user.role_level || 0;
        const purchaseLevel = await MemberTierService.getPurchaseLevelByCode(user.purchase_level_code);
        const agentId = user.agent_id || null;

        let nLeaderUser = null;
        if (roleLevel === constants.ROLES.N_MEMBER && user.n_leader_id) {
            nLeaderUser = await User.findByPk(user.n_leader_id, { transaction });
        }

        const commercePolicy = await MemberTierService.getCommercePolicy();
        const globalRate = commercePolicy?.global_discount?.enabled
            ? Number(commercePolicy?.global_discount?.rate || 1)
            : 1;
        const levelRate = commercePolicy?.member_level_extra_discount?.enabled
            ? await MemberTierService.getLevelDiscountRate(roleLevel)
            : 1;
        const finalDiscountRate = Number((globalRate * levelRate).toFixed(4));
        const distributorRole = user.parent_id
            ? (await User.findByPk(user.parent_id, { attributes: ['role_level'], transaction }))?.role_level || 0
            : null;

        return {
            user,
            roleLevel,
            purchaseLevel,
            agentId,
            nLeaderUser,
            commercePolicy,
            finalDiscountRate,
            distributorRole
        };
    }

    static async resolvePickupStationContext({ deliveryType, pickupStationId, addressId, transaction }) {
        let pickupStation = null;

        if (deliveryType === 'pickup') {
            if (!pickupStationId) {
                await this.rollbackWithError(transaction, '请选择自提门店');
            }

            pickupStation = await ServiceStation.findByPk(pickupStationId, { transaction });
            if (!pickupStation || pickupStation.status !== 'active' || !Number(pickupStation.is_pickup_point)) {
                await this.rollbackWithError(transaction, '自提门店不可用，请重新选择');
            }
        } else if (!addressId) {
            await this.rollbackWithError(transaction, '请选择收货地址');
        }

        return pickupStation;
    }

    static async buildAddressSnapshot({
        deliveryType,
        addressId,
        userId,
        user,
        pickupStation,
        transaction
    }) {
        let addressSnapshot = null;
        let resolvedAddressId = addressId || null;

        if (deliveryType === 'express') {
            const addr = await Address.findOne({
                where: { id: addressId, user_id: userId },
                transaction
            });
            if (!addr) {
                await this.rollbackWithError(transaction, '收货地址不存在或无权限使用');
            }
            addressSnapshot = {
                receiver_name: addr.receiver_name,
                phone: addr.phone,
                province: addr.province,
                city: addr.city,
                district: addr.district,
                detail: addr.detail
            };
        } else if (addressId) {
            const addr = await Address.findOne({
                where: { id: addressId, user_id: userId },
                transaction
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

        if (deliveryType === 'pickup' && !addressSnapshot) {
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

        return { addressSnapshot, resolvedAddressId };
    }

    static async createOrder(req) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user.id;
            const {
                addressId,
                deliveryType,
                pickupStationId,
                remark,
                userCouponId,
                pointsToUse,
                slashNo,
                groupNo,
                limitedSpot
            } = this.parseCreatePayload(req.body);

            let items;
            try {
                items = this.normalizeCreateItems(req.body);
            } catch (error) {
                await this.rollbackWithError(t, error.message);
            }

            const lsCtx = await this.resolveLimitedSpotContext({ limitedSpot, items });
            await this.validatePromotionExclusivity({
                transaction: t,
                limitedSpotContext: lsCtx,
                userCouponId,
                pointsToUse,
                slashNo,
                groupNo
            });

            for (const item of items) {
                if (!item.product_id || !item.quantity || item.quantity < 1) {
                    await this.rollbackWithError(t, 'items 中每项都需要 product_id 和 quantity');
                }
            }

            const pickupStation = await this.resolvePickupStationContext({
                deliveryType,
                pickupStationId,
                addressId,
                transaction: t
            });

            const {
                user,
                roleLevel,
                purchaseLevel,
                agentId,
                nLeaderUser,
                commercePolicy,
                finalDiscountRate,
                distributorRole
            } = await this.buildUserOrderContext({ userId, transaction: t });

            // 获取地址快照（快递必填地址；自提可选地址，无则用工站信息+用户手机）
            const { addressSnapshot, resolvedAddressId } = await this.buildAddressSnapshot({
                deliveryType,
                addressId,
                userId,
                user,
                pickupStation,
                transaction: t
            });

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
                    await this.rollbackWithError(t, `商品 ${product_id} 不存在或已下架`);
                }
                if (deliveryType === 'pickup' && !Number(product.supports_pickup)) {
                    await this.rollbackWithError(t, `商品「${product.name}」不支持到店自提`);
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
                        await this.rollbackWithError(t, `商品 ${product_id} 的规格 ${sku_id} 不存在`);
                    }
                    price = await PricingService.calculatePayableUnitPrice(product, sku, roleLevel, purchaseLevel);
                    stockTarget = sku;
                } else {
                    price = await PricingService.calculatePayableUnitPrice(product, null, roleLevel, purchaseLevel);
                }
                // 砍价单：用砍价价格覆盖，不再叠加折扣
                let slashRecord = null;
                if (slashNo) {
                    slashRecord = await SlashRecord.findOne({
                        where: { slash_no: slashNo, user_id: userId, product_id },
                        include: [{ model: SlashActivity, as: 'activity' }],
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    if (!slashRecord) {
                        await this.rollbackWithError(t, '砍价记录不存在或不属于当前用户');
                    }
                    if (slashRecord.status === 'purchased') {
                        await this.rollbackWithError(t, '该砍价已购买过');
                    }
                    if (slashRecord.status === 'expired') {
                        await this.rollbackWithError(t, '砍价已过期');
                    }
                    if (!['active', 'success'].includes(slashRecord.status)) {
                        await this.rollbackWithError(t, '砍价状态异常');
                    }
                    if (slashRecord.activity && slashRecord.activity.sold_count >= slashRecord.activity.stock_limit) {
                        await this.rollbackWithError(t, '砍价活动库存已售罄');
                    }
                    price = parseFloat(slashRecord.current_price);
                    if (quantity !== 1) {
                        await this.rollbackWithError(t, '砍价商品每次只能购买1件');
                    }
                } else if (groupNo) {
                    // 拼团单：用拼团价覆盖，不叠加折扣
                    const groupOrder = await GroupOrder.findOne({
                        where: { group_no: groupNo },
                        include: [{ model: GroupActivity, as: 'activity' }],
                        transaction: t, lock: t.LOCK.UPDATE
                    });
                    if (!groupOrder) {
                        await this.rollbackWithError(t, '拼团不存在');
                    }
                    if (groupOrder.status !== 'success') {
                        await this.rollbackWithError(t, groupOrder.status === 'open' ? '拼团尚未成团，请等待成团后再下单' : '拼团已结束');
                    }
                    const isMember = await GroupMember.findOne({
                        where: { group_order_id: groupOrder.id, user_id: userId, status: 'joined' },
                        transaction: t
                    });
                    if (!isMember) {
                        await this.rollbackWithError(t, '您不是该拼团的成员');
                    }
                    if (groupOrder.product_id !== product_id) {
                        await this.rollbackWithError(t, '商品与拼团活动不匹配');
                    }
                    if (groupOrder.activity && groupOrder.activity.sku_id != null && groupOrder.activity.sku_id !== '') {
                        const actSku = parseInt(groupOrder.activity.sku_id, 10);
                        const reqSku = normalizeSkuIdForFk(sku_id);
                        if (!Number.isFinite(actSku) || reqSku !== actSku) {
                            await this.rollbackWithError(t, '拼团活动限定了规格，请在确认订单时选择与活动一致的「商品属性」');
                        }
                    }
                    if (groupOrder.activity && groupOrder.activity.sold_count >= groupOrder.activity.stock_limit) {
                        await this.rollbackWithError(t, '拼团活动库存已售罄');
                    }
                    const existingGroupOrder = await Order.findOne({
                        where: { buyer_id: userId, remark: { [Op.like]: `%group_no:${groupNo}%` }, status: { [Op.notIn]: ['cancelled'] } },
                        transaction: t
                    });
                    if (existingGroupOrder) {
                        await this.rollbackWithError(t, '您已在该拼团中下过单');
                    }
                    price = parseFloat(groupOrder.group_price);
                    if (quantity !== 1) {
                        await this.rollbackWithError(t, '拼团商品每次只能购买1件');
                    }
                } else if (lsCtx) {
                    price = parseFloat(lsCtx.unit_price);
                    if (quantity !== 1) {
                        await this.rollbackWithError(t, '活动专享每次只能购买1件');
                    }
                }
                // 普品应付单价已在 calculatePayableUnitPrice 中乘 finalDiscountRate 等价系数，此处不再二次折扣

                // 库存校验
                if (stockTarget.stock < quantity) {
                    await this.rollbackWithError(t, `商品「${product.name}」库存不足，当前仅剩 ${stockTarget.stock} 件`);
                }

                let agent = null;
                if (agentId) {
                    agent = await User.findByPk(agentId, { transaction: t, lock: t.LOCK.UPDATE });
                }

                // 锁定发货扣款成本单价
                // 代理履约按归属代理等级锁定手工配置的供货成本价；平台履约继续保留平台成本价口径。
                const baseCost = parseFloat(
                    product.cost_price
                    || product.price_agent
                    || product.price_leader
                    || product.price_member
                    || product.retail_price
                );

                // N路径：lockedAgentCost = 大N的拿货价（purchase_level_code=n_leader），差价归大N
                // 小n 按自己的购买价（purchase_level_code=n_member）付款，差价自动计提给大N
                let lockedAgentCost;
                let commissionConfig = null;
                if (roleLevel === constants.ROLES.N_MEMBER && nLeaderUser) {
                    const leaderPurchaseLevel = await MemberTierService.getPurchaseLevelByCode(nLeaderUser.purchase_level_code);
                    // calculatePayableUnitPrice 是 async，且含全场折扣；大N拿货价应用其自身的价格档
                    const leaderPrice = await PricingService.calculatePayableUnitPrice(product, sku, nLeaderUser.role_level, leaderPurchaseLevel);
                    lockedAgentCost = parseFloat((leaderPrice).toFixed(2));
                } else {
                    if (agent?.role_level >= constants.ROLES.AGENT) {
                        try {
                            const commCfg = await AppConfig.findOne({ where: { config_key: 'agent_system_commission', status: 1 } });
                            if (commCfg) {
                                commissionConfig = JSON.parse(commCfg.config_value);
                            }
                        } catch (_) {}
                    }
                    const configuredSupplyPrice = this.getProductSupplyPriceForRole(product, agent?.role_level);
                    lockedAgentCost = parseFloat((configuredSupplyPrice || baseCost).toFixed(2));
                }

                // 拆单逻辑（代理商云库存判断）
                let agentQuantity = 0;
                let platformQuantity = quantity;

                if (agent && agent.role_level >= constants.ROLES.AGENT && agent.stock_count > 0) {
                    const configuredSupplyPrice = this.getProductSupplyPriceForRole(product, agent.role_level);
                    const defaultPlatformFulfillment = commissionConfig?.default_platform_fulfillment !== false;
                    if (!defaultPlatformFulfillment && !configuredSupplyPrice) {
                        await this.rollbackWithError(
                            t,
                            `商品「${product.name}」未配置${this.getAgentLevelLabel(agent.role_level)}发货成本价，暂不能走代理发货`
                        );
                    }
                    // 默认平台发货可由后台配置切换；关闭后按代理可用库存优先分配代理履约。
                    agentQuantity = defaultPlatformFulfillment ? 0 : Math.min(agent.stock_count, quantity);
                    platformQuantity = quantity - agentQuantity;
                }

                // 公共订单字段
                const commonFields = {
                    buyer_id: userId,
                    product_id,
                    sku_id,
                    address_id: resolvedAddressId,
                    address_snapshot: addressSnapshot,
                    remark,
                    status: 'pending',
                    agent_id: agentId,
                    distributor_id: user.parent_id || null,
                    distributor_role: distributorRole,
                    locked_agent_cost: lockedAgentCost,
                    member_discount_rate: finalDiscountRate,
                    delivery_type: deliveryType,
                    pickup_station_id: deliveryType === 'pickup' ? pickupStationId : null
                };

                // 价格倒挂保护
                if (agentQuantity > 0 && price < lockedAgentCost) {
                    await this.rollbackWithError(t, `商品「${product.name}」价格倒挂，无法作为代理发货，请联系客服`);
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
                deliveryType === 'pickup' ? 0 : calcShippingFeeByPolicy(commercePolicy, addressSnapshot);
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
            if (userCouponId) {
                const uc = await UserCoupon.findOne({
                    where: { id: userCouponId, user_id: userId },
                    transaction: t,
                    lock: t.LOCK.UPDATE
                });
                if (!uc) {
                    await this.rollbackWithError(t, '优惠券不存在或不属于当前用户');
                }
                if (uc.status !== 'unused') {
                    await this.rollbackWithError(t, '优惠券已使用或已过期');
                }
                if (new Date(uc.expire_at) < new Date()) {
                    await this.rollbackWithError(t, '优惠券已过期');
                }
                const minPurchase = getEffectiveMinPurchase(uc);
                if (minPurchase > totalAmountSum) {
                    await this.rollbackWithError(t, `订单金额未满足优惠券最低消费 ${minPurchase} 元`);
                }
                if (!isCouponApplicable(uc, {
                    productIds: Array.from(orderProductIds),
                    categoryIds: Array.from(orderCategoryIds)
                })) {
                    await this.rollbackWithError(t, '优惠券不适用于当前商品');
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

                // 标记优惠券为已使用（记录锚点订单，便于售后核对；与取消订单/退款退券逻辑一致）
                appliedUserCoupon.status = 'used';
                appliedUserCoupon.used_at = new Date();
                const rootOrdersForCoupon = allOrders.filter(o => !o.parent_order_id);
                const couponAnchorOrderId = rootOrdersForCoupon[0]?.id || allOrders[0]?.id;
                if (couponAnchorOrderId) {
                    appliedUserCoupon.used_order_id = couponAnchorOrderId;
                }
                await appliedUserCoupon.save({ transaction: t });
            }

            // ★ 积分抵扣（在优惠券之后）
            if (pointsToUse > 0) {
                const pointAccount = await PointAccount.findOne({ where: { user_id: userId }, transaction: t, lock: t.LOCK.UPDATE });
                if (pointAccount && pointAccount.balance_points > 0) {
                    const afterCouponTotal = allOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
                    const maxDeductPoints = Math.floor(afterCouponTotal * 0.5 / 0.01);
                    const actualPoints = Math.min(pointsToUse, pointAccount.balance_points, maxDeductPoints);
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
            if (slashNo) {
                const sr = await SlashRecord.findOne({ where: { slash_no: slashNo }, transaction: t, lock: t.LOCK.UPDATE });
                if (sr) {
                    await sr.update({ status: 'purchased', purchased_at: new Date() }, { transaction: t });
                    await SlashActivity.increment('sold_count', { where: { id: sr.activity_id }, transaction: t });
                }
            }

            // 拼团订单：标记成员为已购买
            if (groupNo) {
                const go = await GroupOrder.findOne({ where: { group_no: groupNo }, transaction: t });
                if (go) {
                    await GroupMember.update(
                        { status: 'purchased' },
                        { where: { group_order_id: go.id, user_id: userId }, transaction: t }
                    );
                    // 在订单备注中记录拼团关联
                    for (const o of allOrders) {
                        if (!o.parent_order_id) {
                            o.remark = [o.remark, `group_no:${groupNo}`].filter(Boolean).join(' | ');
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
            if (!t.finished) {
                await t.rollback();
            }
            logError('ORDER', '创建订单失败', {
                error: error.message,
                stack: error.stack,
                userId: req.user?.id
            });
            throw new Error('创建订单失败');
        }
    };
}

module.exports = OrderCreationService;
