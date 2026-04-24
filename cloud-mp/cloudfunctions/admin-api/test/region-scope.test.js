'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeAdministrativeRegionText,
    normalizeCityText
} = require('../src/shared/region-scope');

test('region scope normalization tolerates common administrative suffixes', () => {
    assert.equal(normalizeAdministrativeRegionText('苏州市'), '苏州');
    assert.equal(normalizeAdministrativeRegionText('苏州'), '苏州');
    assert.equal(normalizeAdministrativeRegionText('虎丘区'), '虎丘');
    assert.equal(normalizeAdministrativeRegionText('江苏省'), '江苏');
    assert.equal(normalizeAdministrativeRegionText('广西壮族自治区'), '广西');
    assert.equal(normalizeAdministrativeRegionText('香港特别行政区'), '香港');
});

test('region city normalization falls back to province for direct-admin city labels', () => {
    assert.equal(normalizeCityText('市辖区', '北京市'), '北京');
    assert.equal(normalizeCityText('', '上海市'), '上海');
    assert.equal(normalizeCityText('苏州市', '江苏省'), '苏州');
});
