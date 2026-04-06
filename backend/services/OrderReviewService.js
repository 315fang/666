const { Order, Review } = require('../models');
const PointService = require('./PointService');
const MemberTierService = require('./MemberTierService');

class OrderReviewService {
    static async submitOrderReview(req) {
        const userId = req.user.id;
        const { id: orderId } = req.params;
        const { rating, content, images } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            throw this.createError('评分必须在1-5之间', 400);
        }
        if (!content || content.trim().length < 5) {
            throw this.createError('评价内容不能少于5个字', 400);
        }
        if (content.trim().length > 500) {
            throw this.createError('评价内容不能超过500字', 400);
        }

        const order = await Order.findOne({
            where: { id: orderId, buyer_id: userId }
        });
        if (!order) {
            throw this.createError('订单不存在', 404);
        }
        if (!['completed', 'shipped'].includes(order.status)) {
            throw this.createError('只有已收货/已完成的订单才能评价', 400);
        }

        const existing = await Review.findOne({
            where: { order_id: orderId, user_id: userId }
        });
        if (existing) {
            throw this.createError('该订单已评价，不能重复提交', 400);
        }

        const review = await Review.create({
            product_id: order.product_id,
            user_id: userId,
            order_id: orderId,
            rating: parseInt(rating, 10),
            content: content.trim(),
            images: Array.isArray(images) ? images.slice(0, 9) : [],
            status: 1
        });

        await Order.update(
            { remark: (order.remark || '') + ' [已评价]' },
            { where: { id: orderId } }
        );

        try {
            const pointRules = await MemberTierService.getPointRules();
            const hasImages = Array.isArray(images) && images.length > 0;
            const reviewPoints = hasImages
                ? (pointRules.review_image?.points ?? pointRules.review?.points ?? 20)
                : (pointRules.review?.points ?? 10);
            const pointType = hasImages ? 'review_image' : 'review';
            await PointService.addPoints(
                userId,
                reviewPoints,
                pointType,
                orderId,
                hasImages ? '图文评价奖励' : '评价商品奖励'
            );
            await PointService.addGrowthValue(userId, 1, null, 'review');
        } catch (_) {
            // 积分奖励失败不阻断评价提交流程
        }

        return {
            data: { id: review.id },
            message: '评价提交成功'
        };
    }

    static createError(message, statusCode) {
        const error = new Error(message);
        error.statusCode = statusCode;
        return error;
    }
}

module.exports = OrderReviewService;
