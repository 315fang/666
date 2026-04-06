/**
 * 活动页「限时活动」卡片下的专享商品（积分 / 现金）
 */
const { AppConfig, Product, ActivitySpotStock } = require('../models');
const { Op } = require('sequelize');
const { normalizeSkuIdForFk } = require('../utils/skuId');

const ACTIVITY_LINKS_CONFIG_KEY = 'activity_links_config';
const ACTIVITY_LINKS_CATEGORY = 'activity';

const LS_RE = /LS:([^:|]{1,48}):([^:|]{1,48}):(pts|pay)/;

async function loadLinksPayload() {
    const row = await AppConfig.findOne({
        where: { category: ACTIVITY_LINKS_CATEGORY, config_key: ACTIVITY_LINKS_CONFIG_KEY, status: 1 }
    });
    let data = { banners: [], permanent: [], limited: [] };
    if (row?.config_value) {
        try {
            data = { ...data, ...JSON.parse(row.config_value) };
        } catch (_) { /* ignore */ }
    }
    return data;
}

function findLimitedCard(payload, cardId) {
    const list = payload.limited || [];
    return list.find((c) => String(c.id) === String(cardId));
}

function assertCardWindow(card) {
    if (!card || !card.end_time) return;
    if (new Date(card.end_time).getTime() <= Date.now()) {
        throw new Error('该限时活动已结束');
    }
}

function normalizeOffer(raw, idx) {
    const enable_points = raw.enable_points === true || raw.enable_points === 1;
    const enable_money = raw.enable_money === true || raw.enable_money === 1;
    if (!enable_points && !enable_money) {
        throw new Error(`专享商品第 ${idx + 1} 项需至少开启积分或现金其一`);
    }
    const points_price = Math.max(0, parseInt(raw.points_price, 10) || 0);
    const money_price = Math.max(0, parseFloat(raw.money_price) || 0);
    if (enable_points && points_price <= 0) throw new Error(`专享商品第 ${idx + 1} 项积分价无效`);
    if (enable_money && money_price <= 0) throw new Error(`专享商品第 ${idx + 1} 项现金价无效`);
    const product_id = parseInt(raw.product_id, 10);
    if (!product_id) throw new Error(`专享商品第 ${idx + 1} 项缺少商品ID`);
    const sku_id = normalizeSkuIdForFk(raw.sku_id);
    const stock_limit = Math.max(1, parseInt(raw.stock_limit, 10) || 99);
    return {
        id: String(raw.id || `o${idx}_${Date.now()}`),
        product_id,
        sku_id,
        enable_points,
        enable_money,
        points_price,
        money_price,
        stock_limit
    };
}

/**
 * 公开详情：card + 商品摘要 + 剩余名额
 */
async function getPublicDetail(cardId) {
    const payload = await loadLinksPayload();
    const card = findLimitedCard(payload, cardId);
    if (!card) return null;
    assertCardWindow(card);
    const spots = Array.isArray(card.spot_products) ? card.spot_products : [];
    if (!spots.length) return { card, products: [] };

    const pids = [...new Set(spots.map((s) => parseInt(s.product_id, 10)).filter(Boolean))];
    const products = await Product.findAll({
        where: { id: { [Op.in]: pids }, status: 1 },
        attributes: ['id', 'name', 'images', 'retail_price']
    });
    const pmap = Object.fromEntries(products.map((p) => [p.id, p]));

    const normalized = [];
    for (let i = 0; i < spots.length; i++) {
        try {
            normalized.push(normalizeOffer(spots[i], i));
        } catch (_) { /* skip bad row */ }
    }
    const offerIds = normalized.map((n) => n.id);
    const stockRows = offerIds.length
        ? await ActivitySpotStock.findAll({
            where: { card_id: String(cardId), offer_id: { [Op.in]: offerIds } }
        })
        : [];
    const smap = Object.fromEntries(stockRows.map((r) => [r.offer_id, r.sold]));

    const out = [];
    for (const norm of normalized) {
        const p = pmap[norm.product_id];
        if (!p) continue;
        const sold = smap[norm.id] || 0;
        const remaining = Math.max(0, norm.stock_limit - sold);
        out.push({
            offer_id: norm.id,
            product_id: norm.product_id,
            sku_id: norm.sku_id,
            enable_points: norm.enable_points,
            enable_money: norm.enable_money,
            points_price: norm.points_price,
            money_price: norm.money_price,
            stock_limit: norm.stock_limit,
            sold,
            remaining,
            product: {
                id: p.id,
                name: p.name,
                images: p.images,
                retail_price: p.retail_price
            }
        });
    }
    return {
        card: {
            id: card.id,
            title: card.title,
            subtitle: card.subtitle,
            tag: card.tag,
            image: card.image,
            gradient: card.gradient,
            end_time: card.end_time
        },
        products: out
    };
}

/**
 * 校验下单上下文（createOrder 前）
 */
async function resolveCreateContext({ card_id, offer_id, redeem_points, product_id, sku_id }) {
    const payload = await loadLinksPayload();
    const card = findLimitedCard(payload, card_id);
    if (!card) throw new Error('限时活动不存在');
    assertCardWindow(card);
    const spots = Array.isArray(card.spot_products) ? card.spot_products : [];
    const raw = spots.find((s) => String(s.id) === String(offer_id));
    if (!raw) throw new Error('专享商品不存在或已下架');
    const norm = normalizeOffer(raw, 0);
    if (parseInt(product_id, 10) !== norm.product_id) throw new Error('商品与活动不匹配');
    const sid = normalizeSkuIdForFk(sku_id);
    if ((norm.sku_id == null) !== (sid == null) || (norm.sku_id != null && norm.sku_id !== sid)) {
        throw new Error('规格与活动不匹配');
    }
    if (redeem_points) {
        if (!norm.enable_points) throw new Error('该商品不支持积分兑换');
    } else if (!norm.enable_money) {
        throw new Error('该商品不支持现金购买');
    }

    const row = await ActivitySpotStock.findOne({
        where: { card_id: String(card_id), offer_id: norm.id }
    });
    const sold = row ? row.sold : 0;
    if (sold >= norm.stock_limit) throw new Error('活动名额已满');

    const unit_price = redeem_points ? 0 : parseFloat(norm.money_price);
    const remarkToken = redeem_points
        ? `LS:${card_id}:${norm.id}:pts`
        : `LS:${card_id}:${norm.id}:pay`;

    return {
        card_id: String(card_id),
        offer_id: norm.id,
        redeem_points: !!redeem_points,
        unit_price,
        points_cost: norm.points_price,
        stock_limit: norm.stock_limit,
        remarkToken,
        offer_key: `ls_${card_id}_${norm.id}`
    };
}

async function incrementSold(transaction, cardId, offerId, stockLimit) {
    let row = await ActivitySpotStock.findOne({
        where: { card_id: String(cardId), offer_id: String(offerId) },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (!row) {
        await ActivitySpotStock.create(
            { card_id: String(cardId), offer_id: String(offerId), sold: 0 },
            { transaction }
        );
        row = await ActivitySpotStock.findOne({
            where: { card_id: String(cardId), offer_id: String(offerId) },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
    }
    if (!row) throw new Error('库存记录异常');
    if (row.sold >= stockLimit) throw new Error('活动名额已满');
    row.sold += 1;
    await row.save({ transaction });
}

async function decrementSold(transaction, cardId, offerId) {
    const locked = await ActivitySpotStock.findOne({
        where: { card_id: String(cardId), offer_id: String(offerId) },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
    if (!locked || locked.sold <= 0) return;
    locked.sold -= 1;
    await locked.save({ transaction });
}

function parseLsRemark(remark) {
    if (!remark || typeof remark !== 'string') return null;
    const m = remark.match(LS_RE);
    if (!m) return null;
    return { cardId: m[1], offerId: m[2], kind: m[3] };
}

/**
 * 取消待支付 / 超时取消时释放活动名额；积分单退回积分
 * @param rootOrder 主订单（无 parent_order_id）
 */
async function onOrderPendingCancelled(rootOrder, buyerId, transaction) {
    if (!rootOrder || !rootOrder.remark) return;
    const parsed = parseLsRemark(rootOrder.remark);
    if (!parsed) return;
    await decrementSold(transaction, parsed.cardId, parsed.offerId);
    if (parsed.kind === 'pts') {
        try {
            const payload = await loadLinksPayload();
            const card = findLimitedCard(payload, parsed.cardId);
            const spots = Array.isArray(card?.spot_products) ? card.spot_products : [];
            const raw = spots.find((s) => String(s.id) === String(parsed.offerId));
            if (!raw) return;
            const norm = normalizeOffer(raw, 0);
            const PointService = require('./PointService');
            await PointService.addPoints(
                buyerId,
                norm.points_price,
                'refund',
                `ls_cancel_${rootOrder.id}`,
                '取消订单退回（限时活动积分兑换）',
                transaction
            );
        } catch (_) { /* ignore */ }
    }
}

module.exports = {
    loadLinksPayload,
    findLimitedCard,
    assertCardWindow,
    normalizeOffer,
    getPublicDetail,
    resolveCreateContext,
    incrementSold,
    decrementSold,
    parseLsRemark,
    onOrderPendingCancelled,
    LS_RE
};
