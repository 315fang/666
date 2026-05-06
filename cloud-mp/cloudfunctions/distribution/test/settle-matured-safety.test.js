'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

test('settleMatured is not exposed through mini program routes', () => {
    const routeFile = fs.readFileSync(path.join(repoRoot, 'miniprogram/utils/requestRoutes.js'), 'utf8');

    assert.equal(routeFile.includes('/commissions/settle-matured'), false);
    assert.equal(routeFile.includes("action: 'settleMatured'"), false);
});

test('settleMatured requires the internal distribution token', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'cloudfunctions/distribution/index.js'), 'utf8');
    const internalActions = source.match(/const internalActions = new Set\(\[([^\]]+)\]\)/);

    assert.ok(internalActions);
    assert.match(internalActions[1], /'settleMatured'/);
});

test('settleMatured only moves matured commissions to pending approval', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'cloudfunctions/distribution/index.js'), 'utf8');
    const start = source.indexOf("'settleMatured': asyncHandler");
    const end = source.indexOf("'withdrawRules': asyncHandler", start);
    const block = source.slice(start, end);

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(block, /status: 'pending_approval'/);
    assert.doesNotMatch(block, /settleCommission/);
    assert.doesNotMatch(block, /status: 'settled'/);
});
