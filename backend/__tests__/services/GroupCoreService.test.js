jest.mock('../../models', () => ({
    GroupActivity: {
        increment: jest.fn(async () => undefined)
    },
    GroupOrder: {
        findOne: jest.fn()
    },
    GroupMember: {
        findOne: jest.fn()
    },
    Product: {},
    SKU: {},
    User: {},
    Order: {
        count: jest.fn(async () => 0)
    },
    UserCoupon: {},
    sequelize: {}
}));

jest.mock('../../services/PointService', () => ({
    addPoints: jest.fn()
}));

jest.mock('../../services/MemberTierService', () => ({
    getPointRules: jest.fn(async () => ({}))
}));

jest.mock('../../services/AgentWalletService', () => ({
    recharge: jest.fn()
}));

jest.mock('../../models/notificationUtil', () => ({
    sendNotification: jest.fn(() => Promise.resolve())
}));

jest.mock('../../utils/logger', () => ({
    error: jest.fn(),
    warn: jest.fn()
}));

jest.mock('../../utils/commission', () => ({
    checkRoleUpgrade: jest.fn(),
    handleSameLevelReferral: jest.fn()
}));

jest.mock('../../utils/secureRandom', () => ({
    secureRandomHex: jest.fn(() => 'ABCDEF')
}));

jest.mock('../../utils/wechat', () => ({
    refundOrder: jest.fn()
}));

const models = require('../../models');
const GroupCoreService = require('../../services/GroupCoreService');

describe('GroupCoreService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('handleOrderPaid should mark member paid and switch group to success after paid count reaches threshold', async () => {
        const groupOrder = {
            id: 10,
            group_no: 'GP001',
            activity_id: 8,
            status: 'open',
            current_members: 1,
            min_members: 2,
            save: jest.fn(async function save() { return this; })
        };
        const member = {
            status: 'joined',
            order_id: null,
            paid_at: null,
            save: jest.fn(async function save() { return this; })
        };

        models.GroupOrder.findOne.mockResolvedValue(groupOrder);
        models.GroupMember.findOne.mockResolvedValue(member);

        const result = await GroupCoreService.handleOrderPaid({
            id: 99,
            buyer_id: 3,
            remark: 'group_no:GP001'
        }, { LOCK: { UPDATE: 'UPDATE' } });

        expect(member.status).toBe('paid');
        expect(groupOrder.status).toBe('success');
        expect(groupOrder.current_members).toBe(2);
        expect(models.GroupActivity.increment).toHaveBeenCalledWith('sold_count', {
            by: 2,
            where: { id: 8 },
            transaction: { LOCK: { UPDATE: 'UPDATE' } }
        });
        expect(result.justSucceeded).toBe(true);
    });

    test('ensureGroupOrderReadyForFulfillment should block open group orders', async () => {
        models.GroupOrder.findOne.mockResolvedValue({
            id: 10,
            group_no: 'GP001',
            status: 'open'
        });
        models.GroupMember.findOne.mockResolvedValue({ id: 5 });

        await expect(GroupCoreService.ensureGroupOrderReadyForFulfillment({
            buyer_id: 3,
            remark: 'group_no:GP001'
        }, {})).rejects.toThrow('该拼团订单尚未成团');
    });
});
