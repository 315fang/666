'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadLottery(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                getTempFileURL: async () => ({ fileList: [] })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../lottery');
    const orderCreatePath = require.resolve('../order-create');
    delete require.cache[modulePath];
    delete require.cache[orderCreatePath];
    try {
        return require('../lottery');
    } finally {
        Module._load = originalLoad;
    }
}

function createDb() {
    const records = {
        'rec-expired': {
            _id: 'rec-expired',
            id: 'rec-expired',
            openid: 'buyer-openid',
            prize_id: 'prize-1',
            prize_name: '实物奖',
            prize_type: 'physical',
            reward_actual_type: 'physical',
            fulfillment_status: 'claim_required',
            claim_required: true,
            shipping_required: true,
            claim_deadline_at: '2026-01-01T00:00:00.000Z',
            reward_snapshot: {
                type: 'physical',
                name: '实物奖',
                claim_required: true,
                shipping_required: true
            }
        }
    };
    const updates = [];
    const command = {
        in: (values) => ({ op: 'in', values }),
        or: (values) => ({ op: 'or', values })
    };
    const db = {
        command,
        serverDate: () => new Date('2026-04-25T00:00:00.000Z'),
        collection: (name) => ({
            doc: (id) => ({
                get: async () => ({ data: name === 'lottery_records' ? records[id] || null : null }),
                update: async ({ data }) => {
                    updates.push({ collection: name, id, data });
                    if (name === 'lottery_records' && records[id]) {
                        records[id] = { ...records[id], ...data };
                    }
                    return { stats: { updated: 1 } };
                }
            }),
            where: () => ({
                orderBy: () => ({
                    limit: () => ({
                        get: async () => ({ data: [] })
                    })
                }),
                limit: () => ({
                    get: async () => ({ data: [] })
                })
            })
        })
    };
    return { db, records, updates };
}

function createLotteryDrawDb(options = {}) {
    const costPoints = options.costPoints ?? 0;
    const failRewardPointLog = !!options.failRewardPointLog;
    const userUpdates = [];
    const pointLogs = [];
    const records = [];
    const command = {
        inc: (value) => ({ op: 'inc', value }),
        gte: (value) => ({ op: 'gte', value }),
        gt: (value) => ({ op: 'gt', value }),
        in: (values) => ({ op: 'in', values }),
        or: (values) => ({ op: 'or', values })
    };
    const user = {
        _id: 'user-1',
        openid: 'buyer-openid',
        points: 20,
        growth_value: 99
    };
    const applyPatch = (row, data = {}) => {
        Object.entries(data).forEach(([key, value]) => {
            if (value && value.op === 'inc') {
                row[key] = Number(row[key] || 0) + value.value;
            } else {
                row[key] = value;
            }
        });
    };
    const query = (data, { onUpdate } = {}) => ({
        where: () => query(data, { onUpdate }),
        orderBy: () => query(data, { onUpdate }),
        limit: () => query(data, { onUpdate }),
        count: async () => ({ total: data.length }),
        get: async () => ({ data }),
        update: async ({ data: patch } = {}) => {
            data.forEach((row) => applyPatch(row, patch));
            if (onUpdate) onUpdate(patch);
            return { stats: { updated: data.length } };
        }
    });
    const db = {
        command,
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => {
            if (name === 'configs') {
                return query([{
                    _id: 'lottery-config',
                    config_key: 'lottery_config',
                    config_value: { enabled: true, max_daily_draws: 3, cost_points: costPoints }
                }]);
            }
            if (name === 'app_configs') return query([]);
            if (name === 'lottery_records') {
                return {
                    ...query(records),
                    add: async ({ data } = {}) => {
                        const row = { _id: `record-${records.length + 1}`, ...data };
                        records.push(row);
                        return { _id: row._id };
                    },
                    doc: (id) => ({
                        get: async () => ({ data: records.find((row) => row._id === id) || null }),
                        update: async ({ data } = {}) => {
                            const row = records.find((item) => item._id === id);
                            if (row) applyPatch(row, data);
                            return { stats: { updated: row ? 1 : 0 } };
                        }
                    })
                };
            }
            if (name === 'lottery_prizes') {
                return query([{
                    _id: 'prize-points',
                    id: 'prize-points',
                    name: '积分奖',
                    type: 'points',
                    prize_value: 12,
                    probability: 1,
                    is_active: true,
                    stock: -1
                }]);
            }
            if (name === 'users') {
                return {
                    where: () => ({
                        limit: () => ({ get: async () => ({ data: [user] }) }),
                        get: async () => ({ data: [user] }),
                        update: async ({ data } = {}) => {
                            userUpdates.push(data);
                            applyPatch(user, data);
                            return { stats: { updated: 1 } };
                        }
                    })
                };
            }
            if (name === 'point_logs') {
                return {
                    add: async ({ data } = {}) => {
                        if (failRewardPointLog && data && data.source === 'lottery') {
                            throw new Error('mock reward point log failure');
                        }
                        pointLogs.push(data);
                        return { _id: `point-log-${pointLogs.length}` };
                    }
                };
            }
            return query([]);
        }
    };
    return { db, user, userUpdates, pointLogs };
}

test('expired lottery claim records are not submittable and are marked expired', async () => {
    const { db, records, updates } = createDb();
    const lottery = loadLottery(db);

    const detail = await lottery.getLotteryClaimDetail('buyer-openid', 'rec-expired');

    assert.equal(detail.can_submit, false);
    assert.equal(detail.record.fulfillment_status, 'expired');
    assert.equal(records['rec-expired'].fulfillment_status, 'expired');
    assert.ok(updates.some((item) => item.collection === 'lottery_records' && item.data.fulfillment_status === 'expired'));
});

test('submitting an expired lottery claim is rejected', async () => {
    const { db } = createDb();
    const lottery = loadLottery(db);

    await assert.rejects(
        () => lottery.createLotteryClaim('buyer-openid', {
            record_id: 'rec-expired',
            address_id: 'addr-1'
        }),
        /领奖已截止/
    );
});

test('point lottery rewards do not increase growth value', async () => {
    const { db, user, userUpdates, pointLogs } = createLotteryDrawDb();
    const lottery = loadLottery(db);

    const result = await lottery.drawLottery('buyer-openid', { lottery_id: 'default' });

    assert.equal(result.success, true);
    assert.equal(user.points, 32);
    assert.equal(user.growth_value, 99);
    assert.equal(pointLogs[0].amount, 12);
    assert.ok(userUpdates.some((patch) => patch.points && patch.points.value === 12));
    assert.equal(userUpdates.some((patch) => patch.growth_value), false);
});

test('lottery refunds draw cost when automatic point reward fails', async () => {
    const { db, user, pointLogs } = createLotteryDrawDb({ costPoints: 5, failRewardPointLog: true });
    const lottery = loadLottery(db);

    const result = await lottery.drawLottery('buyer-openid', { lottery_id: 'default' });

    assert.equal(result.success, true);
    assert.equal(result.fulfillment_status, 'failed');
    assert.equal(user.points, 20);
    assert.ok(pointLogs.some((row) => row.source === 'lottery_draw' && row.amount === 5));
    assert.ok(pointLogs.some((row) => row.source === 'lottery_draw_refund' && row.amount === 5));
});
