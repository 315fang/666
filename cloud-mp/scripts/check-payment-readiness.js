'use strict';

const path = require('path');
const { loadPaymentConfig } = require('../cloudfunctions/payment/config');

const config = loadPaymentConfig(process.env);

const output = {
    mode: config.mode,
    provider: config.provider,
    formalConfigured: config.formalConfigured,
    missingFormalKeys: config.missingFormalKeys,
    formalCheckSummary: config.formalCheckSummary,
    expectedFiles: {
        privateKey: path.resolve(__dirname, '../cloudfunctions/payment', config.wechat.privateKeyPath || 'certs/apiclient_key.pem'),
        platformCert: path.resolve(__dirname, '../cloudfunctions/payment', config.wechat.platformCertPath || 'certs/wechatpay_platform.pem')
    }
};

console.log(JSON.stringify(output, null, 2));

if (config.mode === 'formal' && !config.formalConfigured) {
    process.exitCode = 1;
}
