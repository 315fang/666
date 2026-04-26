'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('mini program launches directly into home tab', () => {
    const appJsonPath = path.join(__dirname, '..', 'miniprogram', 'app.json');
    const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

    assert.equal(appConfig.pages[0], 'pages/index/index');
    assert.ok(appConfig.pages.includes('pages/splash/splash'));
});
