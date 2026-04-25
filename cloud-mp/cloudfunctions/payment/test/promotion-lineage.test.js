'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { applyPromotionSeparation } = require('../promotion-lineage');

function createFakeDb(seed = {}) {
    const collections = {
        users: seed.users || [],
        promotion_lineage_logs: seed.promotion_lineage_logs || []
    };

    function findRow(name, id) {
        return (collections[name] || []).find((row) => String(row._id || row.id || row.openid) === String(id));
    }

    function applyPatch(row, patch) {
        Object.keys(patch).forEach((key) => {
            row[key] = patch[key];
        });
    }

    return {
        collections,
        serverDate() {
            return '2026-04-25T00:00:00.000Z';
        },
        collection(name) {
            if (!collections[name]) collections[name] = [];
            return {
                doc(id) {
                    return {
                        async update({ data }) {
                            const row = findRow(name, id);
                            if (!row) throw new Error(`doc not found: ${name}/${id}`);
                            applyPatch(row, data);
                            return { stats: { updated: 1 } };
                        }
                    };
                },
                where(criteria) {
                    return {
                        async update({ data }) {
                            const rows = collections[name].filter((row) => {
                                return Object.keys(criteria || {}).every((key) => String(row[key]) === String(criteria[key]));
                            });
                            rows.forEach((row) => applyPatch(row, data));
                            return { stats: { updated: rows.length } };
                        }
                    };
                },
                async add({ data }) {
                    collections[name].push({ ...data, _id: `${name}-${collections[name].length + 1}` });
                    return { _id: collections[name][collections[name].length - 1]._id };
                }
            };
        }
    };
}

test('applyPromotionSeparation detaches upgraded user and rebases direct members to old parent', async () => {
    const db = createFakeDb({
        users: [
            { _id: 'u-a', openid: 'openid-a', nick_name: 'A', role_level: 3 },
            { _id: 'u-b', openid: 'openid-b', nick_name: 'B', role_level: 4, referrer_openid: 'openid-a', parent_openid: 'openid-a', parent_id: 'u-a' },
            { _id: 'u-c', openid: 'openid-c', nick_name: 'C', role_level: 1, referrer_openid: 'openid-b', parent_openid: 'openid-b', parent_id: 'u-b' },
            { _id: 'u-d', openid: 'openid-d', nick_name: 'D', role_level: 1, referrer_openid: 'openid-b', parent_openid: 'openid-b', parent_id: 'u-b', invited_by_openid: 'openid-original' }
        ]
    });

    const [parent, upgraded, child, preservedChild] = db.collections.users;
    const result = await applyPromotionSeparation(db, {}, {
        user: upgraded,
        parent,
        directMembers: [child, preservedChild],
        previousRoleLevel: 3,
        nextRoleLevel: 4,
        triggerOrderId: 'order-1'
    });

    assert.equal(result.separated, true);
    assert.equal(result.movedCount, 2);

    assert.equal(upgraded.referrer_openid, '');
    assert.equal(upgraded.parent_openid, '');
    assert.equal(upgraded.parent_id, null);
    assert.equal(upgraded.separated_from_parent_openid, 'openid-a');

    assert.equal(child.referrer_openid, 'openid-a');
    assert.equal(child.parent_openid, 'openid-a');
    assert.equal(child.parent_id, 'u-a');
    assert.equal(child.previous_parent_openid, 'openid-b');
    assert.equal(child.invited_by_openid, 'openid-b');
    assert.equal(child.invited_by_name, 'B');

    assert.equal(preservedChild.referrer_openid, 'openid-a');
    assert.equal(preservedChild.invited_by_openid, 'openid-original');

    assert.equal(db.collections.promotion_lineage_logs.length, 1);
    assert.equal(db.collections.promotion_lineage_logs[0].reparented_member_count, 2);
});

test('applyPromotionSeparation skips when parent level is not lower', async () => {
    const db = createFakeDb({
        users: [
            { _id: 'u-a', openid: 'openid-a', role_level: 4 },
            { _id: 'u-b', openid: 'openid-b', role_level: 4, referrer_openid: 'openid-a' }
        ]
    });

    const result = await applyPromotionSeparation(db, {}, {
        user: db.collections.users[1],
        parent: db.collections.users[0],
        directMembers: [],
        previousRoleLevel: 3,
        nextRoleLevel: 4,
        triggerOrderId: 'order-1'
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'parent_not_lower');
    assert.equal(db.collections.users[1].referrer_openid, 'openid-a');
});
