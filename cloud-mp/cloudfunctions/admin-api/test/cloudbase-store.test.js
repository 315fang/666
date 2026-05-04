'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cloudbaseSdk = require('@cloudbase/node-sdk');
const { createCloudBaseStore } = require('../src/store/providers/cloudbase');

function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createFakeCloudbaseApp({ setBarrier, setCalls, initialData = {} }) {
    const collections = new Map();

    Object.entries(initialData).forEach(([collectionName, rowsById]) => {
        const docs = new Map();
        Object.entries(rowsById || {}).forEach(([id, row]) => {
            docs.set(String(id), clone(row));
        });
        collections.set(String(collectionName), docs);
    });

    function getDocs(name) {
        const key = String(name);
        if (!collections.has(key)) collections.set(key, new Map());
        return collections.get(key);
    }

    return {
        database() {
            return {
                collection(name) {
                    const docs = getDocs(name);
                    return {
                        skip(offset) {
                            return {
                                limit(limit) {
                                    return {
                                        async get() {
                                            const data = Array.from(docs.entries())
                                                .slice(offset, offset + limit)
                                                .map(([id, row]) => ({ _id: id, ...clone(row) }));
                                            return { data };
                                        }
                                    };
                                }
                            };
                        },
                        doc(id) {
                            const docId = String(id);
                            return {
                                async get() {
                                    const row = docs.get(docId);
                                    return { data: row ? { _id: docId, ...clone(row) } : null };
                                },
                                async set({ data }) {
                                    setCalls.push({ collection: name, docId, data: clone(data) });
                                    await setBarrier.promise;
                                    docs.set(docId, clone(data));
                                    return {};
                                },
                                async update({ data }) {
                                    const current = docs.get(docId) || {};
                                    docs.set(docId, { ...current, ...clone(data) });
                                    return {};
                                },
                                async remove() {
                                    docs.delete(docId);
                                    return {};
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}

test('CloudBase store flush waits for already pending background collection writes', async () => {
    const originalInit = cloudbaseSdk.init;
    const setBarrier = createDeferred();
    const setCalls = [];

    cloudbaseSdk.init = () => createFakeCloudbaseApp({ setBarrier, setCalls });

    try {
        const store = createCloudBaseStore({
            cloudbase: { envId: 'test-env', collectionPrefix: '' },
            dataRoot: '',
            normalizedDataRoot: '',
            runtimeRoot: '',
            preferNormalizedData: false,
            isFunctionRuntime: false
        });

        await store.readyPromise;
        await store.reloadCollection('coupons');
        store.saveCollection('coupons', [{ id: 1, name: '新人券' }]);

        let flushSettled = false;
        const flushPromise = store.flush().then(() => {
            flushSettled = true;
        });

        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(flushSettled, false);
        assert.equal(setCalls.length, 1);
        assert.equal(setCalls[0].collection, 'coupons');
        assert.equal(setCalls[0].docId, '1');

        setBarrier.resolve();
        await flushPromise;
        assert.equal(flushSettled, true);
    } finally {
        cloudbaseSdk.init = originalInit;
    }
});

test('CloudBase store does not mark later mutable collection saves as flushed by an older pending write', async () => {
    const originalInit = cloudbaseSdk.init;
    const setBarrier = createDeferred();
    const setCalls = [];

    cloudbaseSdk.init = () => createFakeCloudbaseApp({
        setBarrier,
        setCalls,
        initialData: {
            configs: {
                member_level_config: {
                    id: 'member_level_config',
                    config_key: 'member_level_config',
                    key: 'member_level_config',
                    config_value: [{ level: 1 }],
                    value: [{ level: 1 }]
                },
                point_rule_config: {
                    id: 'point_rule_config',
                    config_key: 'point_rule_config',
                    key: 'point_rule_config',
                    config_value: { checkin: { points: 1 } },
                    value: { checkin: { points: 1 } }
                }
            }
        }
    });

    try {
        const store = createCloudBaseStore({
            cloudbase: { envId: 'test-env', collectionPrefix: '' },
            dataRoot: '',
            normalizedDataRoot: '',
            runtimeRoot: '',
            preferNormalizedData: false,
            isFunctionRuntime: false
        });

        await store.readyPromise;
        await store.reloadCollection('configs');

        const firstRows = store.getCollection('configs');
        const memberIndex = firstRows.findIndex((row) => row.config_key === 'member_level_config');
        firstRows[memberIndex] = {
            ...firstRows[memberIndex],
            config_value: [{ level: 2 }],
            value: [{ level: 2 }]
        };
        store.saveCollection('configs', firstRows);

        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(setCalls.length, 1);
        assert.equal(setCalls[0].docId, 'member_level_config');

        const secondRows = store.getCollection('configs');
        const pointIndex = secondRows.findIndex((row) => row.config_key === 'point_rule_config');
        secondRows[pointIndex] = {
            ...secondRows[pointIndex],
            config_value: { checkin: { points: 5 } },
            value: { checkin: { points: 5 } }
        };
        store.saveCollection('configs', secondRows);

        setBarrier.resolve();
        await store.flush();

        const pointRuleWrite = setCalls.find((call) => call.docId === 'point_rule_config');
        assert.ok(pointRuleWrite);
        assert.equal(pointRuleWrite.data.config_value.checkin.points, 5);
        assert.equal(pointRuleWrite.data.value.checkin.points, 5);
    } finally {
        cloudbaseSdk.init = originalInit;
    }
});
