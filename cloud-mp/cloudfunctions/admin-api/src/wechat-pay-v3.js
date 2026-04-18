'use strict';

const crypto = require('crypto');

function verifySignature(timestamp, nonceStr, body, signature, publicKey) {
    const message = `${timestamp}\n${nonceStr}\n${body}\n`;
    const verify = crypto.createVerify('sha256');
    verify.update(message);
    return verify.verify(publicKey, signature, 'base64');
}

function decryptResource(ciphertext, nonce, associatedData, apiV3Key) {
    const key = Buffer.from(String(apiV3Key || ''), 'utf8');
    if (key.length !== 32) {
        throw new Error('微信支付 API V3 Key 无效');
    }

    const iv = Buffer.from(String(nonce || ''), 'utf8');
    const payload = Buffer.from(String(ciphertext || ''), 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(payload.slice(payload.length - 16));
    decipher.setAAD(Buffer.from(String(associatedData || ''), 'utf8'));

    const decrypted = Buffer.concat([
        decipher.update(payload.slice(0, payload.length - 16)),
        decipher.final()
    ]);

    return JSON.parse(decrypted.toString('utf8'));
}

module.exports = {
    verifySignature,
    decryptResource
};
