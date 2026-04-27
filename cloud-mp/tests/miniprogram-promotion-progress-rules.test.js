'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const pageSource = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'distribution', 'promotion-progress.js'),
    'utf8'
);
const pageMarkup = fs.readFileSync(
    path.join(__dirname, '..', 'miniprogram', 'pages', 'distribution', 'promotion-progress.wxml'),
    'utf8'
);

test('deposit extraction rules explain the real transfer-to-commission flow', () => {
    assert.match(pageMarkup, /存款提取规则/);
    assert.match(pageSource, /生成转佣金申请/);
    assert.match(pageSource, /审核通过后转入佣金余额/);
    assert.match(pageSource, /审核中不能重复提交/);
    assert.doesNotMatch(pageSource, /未达到对应代理等级存款无效/);
});
