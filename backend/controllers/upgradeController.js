/**
 * 升级申请控制器（薄包装层）
 *
 * 所有业务逻辑和 DB 操作已迁移至 UpgradeMemberService。
 * 本层仅负责参数提取、调用 Service、返回 HTTP 响应。
 */
const UpgradeMemberService = require('../services/UpgradeMemberService');

exports.applyUpgrade = async (req, res, next) => {
    try {
        const result = await UpgradeMemberService.applyUpgrade(req.user.id, req.body);
        if (result.code !== 0) {
            const status = result.message.includes('不存在') ? 404 : (result.code === -1 && result.message.includes('无效') ? 400 : 200);
            return res.status(status).json(result);
        }
        res.json(result);
    } catch (err) { next(err); }
};

exports.prepayUpgrade = async (req, res, next) => {
    try {
        const result = await UpgradeMemberService.prepayUpgrade(req.user.id, req.body.application_id);
        if (result.code !== 0) return res.status(404).json(result);
        res.json(result);
    } catch (err) { next(err); }
};

/**
 * 微信支付回调
 * 必须返回纯文本 SUCCESS(200) 或 FAIL(500)，否则微信会无限重试
 */
exports.upgradePayNotify = async (req, res) => {
    try {
        const result = await UpgradeMemberService.handlePayNotify(req.notifyData || req.body);
        if (result.status === 'FAIL') return res.status(500).send('FAIL');
        return res.send('SUCCESS');
    } catch (err) {
        const { logError } = require('../utils/logger');
        logError('[升级支付回调] 处理失败', err);
        return res.status(500).send('FAIL');
    }
};

exports.getMyUpgradeApplications = async (req, res, next) => {
    try {
        const apps = await UpgradeMemberService.getMyApplications(req.user.id);
        res.json({ code: 0, data: apps });
    } catch (err) { next(err); }
};

exports.adminGetApplications = async (req, res) => {
    try {
        const result = await UpgradeMemberService.adminGetApplications(req.query);
        res.json({ code: 0, data: result });
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};

exports.adminReviewApplication = async (req, res) => {
    try {
        const result = await UpgradeMemberService.adminReviewApplication({
            applicationId: req.params.id,
            action: req.body.action,
            remark: req.body.remark,
            adminId: req.admin?.id
        });
        if (result.code !== 0 && result.message.includes('不存在')) {
            return res.status(404).json(result);
        }
        res.json(result);
    } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
};
