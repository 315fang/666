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

function createFakeCloudbaseApp({ setBarrier, setCalls }) {
    const collections = new Map();

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
