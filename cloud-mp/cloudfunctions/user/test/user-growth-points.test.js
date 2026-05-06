'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadGrowthModule(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                database: () => db
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../user-growth');
    delete require.cache[modulePath];
    try {
        return {
            module: require('../user-growth'),
            restore: () => {
                Module._load = originalLoad;
                delete require.cache[modulePath];
            }
        };
    } catch (error) {
        Module._load = originalLoad;
        delete require.cache[modulePath];
        throw error;
    }
}

function createDbMock() {
    const users = [{ _id: 'user-1', openid: 'openid-1', points: 10, growth_value: 99 }];
    const updates = [];
    const db = {
        command: {
            inc: (value) => ({ op: 'inc', value })
        },
        serverDate: () => new Date('2026-05-05T00:00:00.000Z'),
        collection(name) {
            if (name === 'users') {
                return {
                    where(where) {
                        return {
                            limit() {
                                return this;
                            },
                            async get() {
                                return { data: users.filter((user) => user.openid === where.openid) };
                            },
                            async update({ data }) {
                                updates.push(data);
                                const user = users.find((item) => item.openid === where.openid);
                                if (user && data.points && data.points.op === 'inc') {
                                    user.points += data.points.value;
                                }
                                return { stats: { updated: user ? 1 : 0 } };
                            }
                        };
                    }
                };
            }
            return {
                where() {
                    return {
                        limit() {
                            return this;
                        },
                        async get() {
                            return { data: [] };
                        }
                    };
                }
            };
        },
        _users: users,
        _updates: updates
    };
    return db;
}

test('addPoints changes points without touching growth_value', async () => {
    const db = createDbMock();
    const { module, restore } = loadGrowthModule(db);

    try {
        const progress = await module.addPoints('openid-1', 5);

        assert.equal(db._users[0].points, 15);
        assert.equal(db._users[0].growth_value, 99);
        assert.equal(db._updates.length, 1);
        assert.deepEqual(db._updates[0].points, { op: 'inc', value: 5 });
        assert.equal(Object.prototype.hasOwnProperty.call(db._updates[0], 'growth_value'), false);
        assert.equal(progress.points, 99);
    } finally {
        restore();
    }
});
