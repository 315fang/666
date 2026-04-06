/**
 * adminNSystemController — N路径代理管理（后台专用）
 * 提供：大N列表、小n列表、大N名下成员查看
 */
const { User, AgentWalletAccount } = require('../../../models');
const { Op } = require('sequelize');
const constants = require('../../../config/constants');
const { ROLES } = constants;

/** 大N 列表 */
exports.getLeaders = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const where = { role_level: ROLES.N_LEADER };
        if (search) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await User.findAndCountAll({
            where,
            include: [
                { model: AgentWalletAccount, as: 'agentWallet', attributes: ['balance'], required: false }
            ],
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'balance', 'createdAt'],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        // 为每个大N附加名下小n数量
        const leaderIds = rows.map(r => r.id);
        const memberCounts = await User.findAll({
            where: { n_leader_id: { [Op.in]: leaderIds }, role_level: ROLES.N_MEMBER },
            attributes: ['n_leader_id', [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'cnt']],
            group: ['n_leader_id'],
            raw: true
        });
        const countMap = {};
        memberCounts.forEach(r => { countMap[r.n_leader_id] = parseInt(r.cnt); });

        const list = rows.map(r => ({
            ...r.get({ plain: true }),
            wallet_balance: parseFloat(r.agentWallet?.balance || 0),
            n_member_count: countMap[r.id] || 0
        }));

        res.json({ code: 0, data: { list, total: count } });
    } catch (e) {
        console.error('[adminNSystem] getLeaders:', e.message);
        res.status(500).json({ code: -1, message: e.message });
    }
};

/** 大N 名下小n */
exports.getLeaderMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const { count, rows } = await User.findAndCountAll({
            where: { n_leader_id: parseInt(id), role_level: ROLES.N_MEMBER },
            include: [
                { model: AgentWalletAccount, as: 'agentWallet', attributes: ['balance'], required: false }
            ],
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'joined_team_at'],
            order: [['joined_team_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        res.json({ code: 0, data: { list: rows, total: count } });
    } catch (e) {
        res.status(500).json({ code: -1, message: e.message });
    }
};

/** 所有小n 列表 */
exports.getMembers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const where = { role_level: ROLES.N_MEMBER };
        if (search) {
            where[Op.or] = [
                { nickname: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows } = await User.findAndCountAll({
            where,
            include: [
                { model: AgentWalletAccount, as: 'agentWallet', attributes: ['balance'], required: false },
                { model: User, as: 'nLeader', attributes: ['id', 'nickname'], required: false }
            ],
            attributes: ['id', 'nickname', 'avatar_url', 'phone', 'joined_team_at', 'n_leader_id'],
            order: [['joined_team_at', 'DESC']],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit)
        });

        const list = rows.map(r => ({
            ...r.get({ plain: true }),
            wallet_balance: parseFloat(r.agentWallet?.balance || 0)
        }));

        res.json({ code: 0, data: { list, total: count } });
    } catch (e) {
        res.status(500).json({ code: -1, message: e.message });
    }
};
