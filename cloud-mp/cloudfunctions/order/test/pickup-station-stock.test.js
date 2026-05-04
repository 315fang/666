'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeStationStockForItems,
    sortStationsByPickupPreference
} = require('../../shared/pickup-station-stock');
const { reservePickupStationInventory } = require('../pickup-station-stock');

function createPickupStockDb(rows) {
    const logs = [];
    const command = {
        inc: (value) => ({ __op: 'inc', value }),
        gte: (value) => ({ __op: 'gte', value })
    };
    const applyUpdate = (row, data = {}) => {
        Object.entries(data).forEach(([key, value]) => {
            if (value && value.__op === 'inc') {
                row[key] = (Number(row[key]) || 0) + value.value;
                return;
            }
            row[key] = value;
        });
    };
    const stockCollection = {
        count: async () => ({ total: rows.length }),
        skip: () => ({
            limit: () => ({
                get: async () => ({ data: rows })
            })
        }),
        where: (where = {}) => ({
            update: async ({ data } = {}) => {
                const row = rows.find((item) => {
                    if (String(item._id) !== String(where._id)) return false;
                    const gte = where.available_qty;
                    if (gte && gte.__op === 'gte') return Number(item.available_qty) >= gte.value;
                    return true;
                });
                if (!row) return { stats: { updated: 0 } };
                applyUpdate(row, data);
                return { stats: { updated: 1 } };
            }
        }),
        doc: (id) => ({
            update: async ({ data } = {}) => {
                const row = rows.find((item) => String(item._id) === String(id));
                if (row) applyUpdate(row, data);
                return { stats: { updated: row ? 1 : 0 } };
            }
        })
    };
    return {
        logs,
        db: {
            command,
            serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
            collection: (name) => {
                if (name === 'station_sku_stocks') return stockCollection;
                if (name === 'station_stock_logs') {
                    return {
                        add: async ({ data } = {}) => {
                            logs.push(data);
                            return { _id: `log-${logs.length}` };
                        }
                    };
                }
                return { add: async () => ({ _id: `${name}-added` }) };
            }
        }
    };
}

test('summarizeStationStockForItems requires full station stock for the whole order', () => {
    const stockRows = [
        { station_id: 'station-1', product_id: 'product-1', sku_id: 'sku-1', available_qty: 3, reserved_qty: 0, cost_price: 10 },
        { station_id: 'station-1', product_id: 'product-2', sku_id: 'sku-2', available_qty: 1, reserved_qty: 0, cost_price: 20 }
    ];

    const result = summarizeStationStockForItems(stockRows, 'station-1', [
        { product_id: 'product-1', sku_id: 'sku-1', quantity: 2 },
        { product_id: 'product-2', sku_id: 'sku-2', quantity: 2 }
    ]);

    assert.equal(result.selectable, false);
    assert.equal(result.stock_status, 'insufficient');
    assert.equal(result.lines[0].stock_status, 'tight');
    assert.equal(result.lines[1].stock_status, 'insufficient');
});

test('summarizeStationStockForItems matches station document id and fallback sku stock', () => {
    const stockRows = [
        { _id: 'stock-doc-1', station_id: 'station-doc-1', product_id: '1', sku_id: 'fallback-sku-1', available_qty: 3, reserved_qty: 0, cost_price: 8 }
    ];

    const result = summarizeStationStockForItems(stockRows, ['3', 'station-doc-1'], [
        { product_id: '1', quantity: 2 }
    ]);

    assert.equal(result.selectable, true);
    assert.equal(result.stock_status, 'tight');
    assert.equal(result.lines[0].stock_id, 'stock-doc-1');
    assert.equal(result.lines[0].available_qty, 3);
});

test('reservePickupStationInventory matches stock rows saved with legacy station id', async () => {
    const rows = [
        {
            _id: 'station_stock_3_sku_3',
            station_id: '3',
            product_id: '21',
            sku_id: '3',
            available_qty: 30,
            reserved_qty: 0,
            cost_price: 12
        }
    ];
    const { db, logs } = createPickupStockDb(rows);

    const result = await reservePickupStationInventory(db, {
        stationId: '78167c7f69d50194082a705d122864b6',
        stationLookupIds: ['78167c7f69d50194082a705d122864b6', 3],
        orderNo: 'ORD-alias',
        items: [
            {
                refund_item_key: '21::3::0',
                product_id: '21',
                sku_id: '3',
                quantity: 2,
                name: '测试商品'
            }
        ]
    });

    assert.equal(result.reservations[0].stock_id, 'station_stock_3_sku_3');
    assert.equal(result.reservations[0].station_id, '3');
    assert.equal(rows[0].available_qty, 28);
    assert.equal(rows[0].reserved_qty, 2);
    assert.equal(logs[0].station_id, '3');
});

test('sortStationsByPickupPreference sorts by distance first and city second', () => {
    const stations = [
        { id: 'station-1', name: '门店A', city: '上海', latitude: 31.2, longitude: 121.5 },
        { id: 'station-2', name: '门店B', city: '杭州', latitude: 30.2, longitude: 120.2 },
        { id: 'station-3', name: '门店C', city: '上海', latitude: null, longitude: null }
    ];

    const result = sortStationsByPickupPreference(stations, {
        lat: 31.21,
        lng: 121.48,
        sortCity: '上海'
    });

    assert.equal(result[0].id, 'station-1');
    assert.equal(result[1].id, 'station-2');
    assert.equal(result[2].id, 'station-3');
    assert.ok(result[0].distance_km != null);
});
