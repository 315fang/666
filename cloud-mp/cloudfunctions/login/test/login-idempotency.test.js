'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadLoginModule() {
    const originalLoad = Module._load;
    const db = {
        command: {
            exists: (value) => ({ op: 'exists', value }),
            in: (values) => ({ op: 'in', values }),
            inc: (value) => ({ op: 'inc', value }),
            or: (conditions) => ({ op: 'or', conditions }),
            remove: () => ({ op: 'remove' })
        },
        collection: () => ({
            where: () => ({
                limit: () => ({ get: async () => ({ data: [] }) }),
                update: async () => ({ stats: { updated: 0 } })
            }),
            doc: () => ({
                get: async () => ({ data: null }),
                set: async () => ({ stats: { updated: 1 } })
            })
        }),
        serverDate: () => new Date('2026-05-01T00:00:00.000Z')
    };

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePath = require.resolve('../index');
    delete require.cache[modulePath];
    try {
        return require('../index');
    } finally {
        Module._load = originalLoad;
        delete require.cache[modulePath];
    }
}

test('new mini program users use a stable document id derived from openid', () => {
    const login = loadLoginModule();

    assert.equal(login._test.userDocIdForOpenid('openid-abc'), 'user-openid-abc');
    assert.equal(login._test.userDocIdForOpenid('openid/a+b'), 'user-openid_a_b');
});

test('invite point log id is deterministic for the same invite pair', () => {
    const login = loadLoginModule();

    assert.equal(
        login._test.invitePointLogDocId('parent-openid', 'child-openid'),
        login._test.invitePointLogDocId('parent-openid', 'child-openid')
    );
    assert.notEqual(
        login._test.invitePointLogDocId('parent-openid', 'child-openid'),
        login._test.invitePointLogDocId('other-parent', 'child-openid')
    );
});
