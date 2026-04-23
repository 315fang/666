'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    summarizeStationStockForItems,
    sortStationsByPickupPreference
} = require('../../shared/pickup-station-stock');

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
