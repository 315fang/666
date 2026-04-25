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
