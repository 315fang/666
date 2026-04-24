'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildStationLookupValues,
    stationRowMatchesStation,
    buildStationLookupMap,
    findStationByLookup,
    findStationInLookupMap
} = require('../shared/station-lookup');

test('station lookup matches staff binding saved with document id or legacy id', () => {
    const station = {
        _id: 'station-doc-2',
        id: 2,
        _legacy_id: 102,
        name: '第二门店'
    };

    assert.deepEqual(buildStationLookupValues(station), ['station-doc-2', '2', '102']);
    assert.equal(stationRowMatchesStation({ station_id: 'station-doc-2' }, station), true);
    assert.equal(stationRowMatchesStation({ station_id: 2 }, station), true);
    assert.equal(stationRowMatchesStation({ station_id: '102' }, station), true);
    assert.equal(stationRowMatchesStation({ station_id: 'station-doc-1' }, station), false);
});

test('station lookup map resolves every id form to the same station', () => {
    const stations = [
        { _id: 'station-doc-1', id: 1, _legacy_id: 101, name: '第一门店' },
        { _id: 'station-doc-2', id: 2, _legacy_id: 102, name: '第二门店' }
    ];
    const map = buildStationLookupMap(stations);

    assert.equal(findStationByLookup(stations, 'station-doc-2')?.name, '第二门店');
    assert.equal(findStationInLookupMap(map, 2)?.name, '第二门店');
    assert.equal(findStationInLookupMap(map, '102')?.name, '第二门店');
});
