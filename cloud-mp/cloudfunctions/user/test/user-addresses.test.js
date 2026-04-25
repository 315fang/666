'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function createAddressDb(records) {
    const ops = [];
    const db = {
        serverDate: () => new Date('2026-04-25T00:00:00.000Z'),
        collection: (name) => {
            assert.equal(name, 'addresses');
            return {
                doc: (id) => ({
                    get: async () => ({
                        data: records[id] ? { _id: id, ...records[id] } : null
                    }),
                    update: async ({ data }) => {
                        if (!records[id]) return { stats: { updated: 0 } };
                        records[id] = { ...records[id], ...data };
                        ops.push({ type: 'doc.update', id, data });
                        return { stats: { updated: 1 } };
                    },
                    remove: async () => {
                        if (!records[id]) return { stats: { removed: 0 } };
                        delete records[id];
                        ops.push({ type: 'doc.remove', id });
                        return { stats: { removed: 1 } };
                    }
                }),
                where: (query) => ({
                    update: async ({ data }) => {
                        let updated = 0;
                        Object.entries(records).forEach(([id, row]) => {
                            const matched = Object.entries(query).every(([key, value]) => row[key] === value);
                            if (!matched) return;
                            records[id] = { ...row, ...data };
                            ops.push({ type: 'where.update', id, query, data });
                            updated += 1;
                        });
                        return { stats: { updated } };
                    }
                })
            };
        }
    };
    return { db, ops };
}

function loadAddressModule(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return { database: () => db };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../user-addresses');
    delete require.cache[modulePath];
    try {
        return require('../user-addresses');
    } finally {
        Module._load = originalLoad;
    }
}

test('address update and delete reject records owned by another openid', async () => {
    const records = {
        alice_addr: { openid: 'alice', receiver_name: 'Alice', is_default: true },
        bob_addr: { openid: 'bob', receiver_name: 'Bob', is_default: false }
    };
    const { db } = createAddressDb(records);
    const addresses = loadAddressModule(db);

    await assert.rejects(
        () => addresses.updateAddress('alice', 'bob_addr', { receiver_name: 'Mallory' }),
        /地址不存在/
    );
    assert.equal(records.bob_addr.receiver_name, 'Bob');

    await assert.rejects(
        () => addresses.deleteAddress('alice', 'bob_addr'),
        /地址不存在/
    );
    assert.ok(records.bob_addr);
});

test('setDefaultAddress validates target ownership before clearing current default', async () => {
    const records = {
        alice_addr: { openid: 'alice', receiver_name: 'Alice', is_default: true },
        bob_addr: { openid: 'bob', receiver_name: 'Bob', is_default: false }
    };
    const { db, ops } = createAddressDb(records);
    const addresses = loadAddressModule(db);

    await assert.rejects(
        () => addresses.setDefaultAddress('alice', 'bob_addr'),
        /地址不存在/
    );
    assert.equal(records.alice_addr.is_default, true);
    assert.equal(ops.length, 0);
});

test('setDefaultAddress only switches default inside the caller address set', async () => {
    const records = {
        alice_addr_1: { openid: 'alice', receiver_name: 'Alice 1', is_default: true },
        alice_addr_2: { openid: 'alice', receiver_name: 'Alice 2', is_default: false },
        bob_addr: { openid: 'bob', receiver_name: 'Bob', is_default: true }
    };
    const { db } = createAddressDb(records);
    const addresses = loadAddressModule(db);

    await addresses.setDefaultAddress('alice', 'alice_addr_2');

    assert.equal(records.alice_addr_1.is_default, false);
    assert.equal(records.alice_addr_2.is_default, true);
    assert.equal(records.bob_addr.is_default, true);
});
