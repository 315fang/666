/**
 * 砍一刀(Slash)控制器 - 薄包装层
 * 职责：提取参数 → 调用 SlashService → res.json() / next(err)
 */

const SlashService = require('../services/SlashService');

/**
 * GET /api/slash/activities
 * 活动列表（按商品筛选，或不传返回全部）
 */
exports.getActivities = async (req, res, next) => {
    try {
        const data = await SlashService.getActivities(req.user, req.query);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/slash/start
 * 发起砍价（任何人，无会员限制）
 * body: { activity_id, sku_id? }
 */
exports.startSlash = async (req, res, next) => {
    try {
        const result = await SlashService.startSlash(req.user, req.body);

        // startSlash 可能返回带 code/message/data 的完整结构
        if (result.code !== undefined) {
            return res.json(result);
        }
        res.json({ code: 0, data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/slash/:slash_no
 * 砍价详情（分享页，无需登录）
 */
exports.getDetail = async (req, res, next) => {
    try {
        const data = await SlashService.getDetail(req.user, req.params);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/slash/:slash_no/help
 * 帮砍一刀（任何人，无会员限制）
 * 登录用户才能帮砍，但不限制身份
 */
exports.helpSlash = async (req, res, next) => {
    try {
        const result = await SlashService.helpSlash(req.user, req.params);

        // helpSlash 可能返回带 code/message/data 的完整结构
        if (result.code !== undefined) {
            return res.json(result);
        }
        res.json({ code: 0, data: result });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/slash/my
 * 我发起的砍价记录
 */
exports.getMy = async (req, res, next) => {
    try {
        const data = await SlashService.getMy(req.user);
        res.json({ code: 0, data });
    } catch (error) {
        next(error);
    }
};
