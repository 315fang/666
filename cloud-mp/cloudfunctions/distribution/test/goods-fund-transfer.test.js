'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createGoodsFundTransferApplication } = require('../goods-fund-transfer');

function createFakeDb(seed = {}) {
    const collections = {
        users: seed.users || [],
        goods_fund_transfer_applications: seed.goods_fund_transfer_applications || []
    };

    function filterRows(rows, criteria = {}) {
        return rows.filter((row) => Object.keys(criteria).every((key) => String(row[key]) === String(criteria[key])));
    }

    return {
        collections,
        collection(name) {
            return {
                where(criteria) {
                    return {
                        limit() {
                            return {
                                async get() {
                                    return { data: filterRows(collections[name] || [], criteria).slice(0, 1) };
                                }
                            };
                        }
                    };
                },
                doc(id) {
                    return {
                        async get() {
                            const row = (collections[name] || []).find((item) => String(item._id || item.id) === String(id));
                            return { data: row || null };
                        },
                        async set({ data }) {
                            assert.equal(Object.prototype.hasOwnProperty.call(data, '_id'), false, 'set data should not contain _id');
                            const rows = collections[name] || [];
                            const nextRow = { ...data, _id: String(id) };
                            const index = rows.findIndex((item) => String(item._id || item.id) === String(id));
                            if (index === -1) rows.push(nextRow);
                            else rows[index] = nextRow;
                        }
                    };
                }
            };
        }
    };
}

test('createGoodsFundTransferApplication only allows direct members', async () => {
    const db = createFakeDb({
        users: [
            { _id: 'u1', id: 1, openid: 'leader-openid', role_level: 4, agent_wallet_balance: 1000 },
            { _id: 'u2', id: 2, openid: 'direct-openid', role_level: 1, referrer_openid: 'leader-openid' },
            { _id: 'u3', id: 3, openid: 'indirect-openid', role_level: 1, referrer_openid: 'direct-openid' }
        ]
    });

    const application = await createGoodsFundTransferApplication(db, 'leader-openid', {
        member_id: 2,
        amount: 200
    });
    assert.equal(application.status, 'pending');
    assert.equal(db.collections.goods_fund_transfer_applications.length, 1);

    await assert.rejects(
        () => createGoodsFundTransferApplication(db, 'leader-openid', {
            member_id: 3,
            amount: 200
        }),
        /仅可给直属下级发起货款划拨申请/
    );
});
