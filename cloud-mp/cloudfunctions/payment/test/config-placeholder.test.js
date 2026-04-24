'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadPaymentConfig, isPlaceholderValue } = require('../config');

test('payment config treats ${...} placeholders as missing values', () => {
    const config = loadPaymentConfig({
        PAYMENT_MODE: 'formal',
        PAYMENT_PROVIDER: 'wechat',
        PAYMENT_WECHAT_APPID: '${WECHAT_PAY_APPID}',
        PAYMENT_WECHAT_MCHID: '${WECHAT_MCH_ID}',
        PAYMENT_WECHAT_NOTIFY_URL: '${WECHAT_PAY_NOTIFY_URL}',
        PAYMENT_WECHAT_SERIAL_NO: '${WECHAT_PAY_SERIAL_NO}',
        PAYMENT_WECHAT_API_V3_KEY: '${WECHAT_PAY_API_V3_KEY}',
        PAYMENT_WECHAT_PUBLIC_KEY_ID: '${WECHAT_PAY_PUBLIC_KEY_ID}'
    });

    assert.equal(isPlaceholderValue('${WECHAT_PAY_MCH_ID}'), true);
    assert.equal(config.formalConfigured, false);
    assert.equal(config.formalCheckSummary.PAYMENT_WECHAT_APPID, false);
    assert.equal(config.formalCheckSummary.PAYMENT_WECHAT_MCHID, false);
    assert.equal(config.formalCheckSummary.PAYMENT_WECHAT_SERIAL_NO, false);
    assert.equal(config.formalCheckSummary.PAYMENT_WECHAT_API_V3_KEY, false);
    assert.match(config.missingFormalKeys.join(','), /PAYMENT_WECHAT_MCHID/);
});
