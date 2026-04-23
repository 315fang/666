'use strict';

const crypto = require('crypto');
const https = require('https');
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { loadPaymentConfig } = require('./config');
const { loadPrivateKey, loadPublicKey } = require('./wechat-pay-v3');

const REQUEST_TIMEOUT_MS = 10000;
const MAX_BATCH_NAME_LENGTH = 32;
const MAX_BATCH_REMARK_LENGTH = 32;
const MAX_TRANSFER_REMARK_LENGTH = 32;
const BATCH_QUERY_MIN_INTERVAL_MS = 60 * 1000;

function pickString(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clampText(value, maxLength, fallback = '') {
    const text = pickString(value, fallback);
    return text ? text.slice(0, maxLength) : '';
}

function normalizeMoneyFen(amountYuan) {
    return Math.round(toNumber(amountYuan, 0) * 100);
}

function signRequest(method, requestPath, timestamp, nonceStr, body, privateKey, mchId, serialNo) {
    const message = `${method}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signer = crypto.createSign('sha256');
    signer.update(message);
    const signature = signer.sign(privateKey, 'base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
}

function requestWechat({ method, requestPath, body, config, privateKey }) {
    return new Promise((resolve, reject) => {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonceStr = crypto.randomBytes(16).toString('hex');
        const bodyStr = body ? JSON.stringify(body) : '';
        const authorization = signRequest(
            method,
            requestPath,
            timestamp,
            nonceStr,
            bodyStr,
            privateKey,
            config.wechat.mchid,
            config.wechat.serialNo
        );

        const req = https.request({
            hostname: 'api.mch.weixin.qq.com',
            port: 443,
            path: requestPath,
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: authorization,
                'User-Agent': 'cloud-mp-payment/1.0',
                'Wechatpay-Serial': config.wechat.publicKeyId || config.wechat.serialNo
            }
        }, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                let parsed = {};
                if (raw) {
                    try {
                        parsed = JSON.parse(raw);
                    } catch (_) {
                        const error = new Error(`Invalid JSON response: ${raw.substring(0, 200)}`);
                        error.statusCode = res.statusCode;
                        reject(error);
                        return;
                    }
                }
                if (res.statusCode >= 400) {
                    const error = new Error(parsed.message || `WeChatPay API error: ${res.statusCode}`);
                    error.code = parsed.code || 'WECHAT_PAY_API_ERROR';
                    error.statusCode = res.statusCode;
                    error.response = parsed;
                    reject(error);
                    return;
                }
                resolve(parsed);
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('WeChatPay transfer request timeout'));
        });
        req.setTimeout(REQUEST_TIMEOUT_MS);

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

function encryptSensitiveValue(plaintext, publicKeyPem) {
    return crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        Buffer.from(String(plaintext), 'utf8')
    ).toString('base64');
}

async function resolveTransferRuntime() {
    const config = loadPaymentConfig(process.env);
    if (config.mode !== 'formal') {
        throw new Error(`当前支付模式不是 formal，不能发起真实微信提现（mode=${config.mode || 'unknown'}）`);
    }
    if (!config.formalConfigured) {
        throw new Error(`微信提现配置不完整：${config.missingFormalKeys.join(', ')}`);
    }
    const privateKey = await loadPrivateKey(cloud);
    const publicKey = await loadPublicKey(cloud);
    return { config, privateKey, publicKey };
}

function buildBatchPayload(params, publicKey) {
    const amountFen = normalizeMoneyFen(params.amount);
    if (amountFen <= 0) {
        throw new Error('提现金额必须大于 0');
    }
    const outBatchNo = pickString(params.out_batch_no);
    const outDetailNo = pickString(params.out_detail_no);
    const openid = pickString(params.openid);
    if (!outBatchNo || !outDetailNo || !openid) {
        throw new Error('微信提现缺少批次号、明细号或 openid');
    }

    const rawUserName = pickString(params.user_name);
    if (amountFen >= 200000 && !rawUserName) {
        throw new Error('当前提现金额达到 2000 元，必须提供用户实名后才能发起微信提现');
    }

    const detail = {
        out_detail_no: outDetailNo,
        transfer_amount: amountFen,
        transfer_remark: clampText(params.transfer_remark, MAX_TRANSFER_REMARK_LENGTH, '佣金提现'),
        openid
    };
    if (rawUserName) {
        detail.user_name = encryptSensitiveValue(rawUserName, publicKey);
    }

    const body = {
        appid: pickString(params.appid),
        out_batch_no: outBatchNo,
        batch_name: clampText(params.batch_name, MAX_BATCH_NAME_LENGTH, '佣金提现'),
        batch_remark: clampText(params.batch_remark, MAX_BATCH_REMARK_LENGTH, '佣金提现'),
        total_amount: amountFen,
        total_num: 1,
        transfer_detail_list: [detail]
    };

    const transferSceneId = pickString(params.transfer_scene_id || process.env.PAYMENT_WECHAT_TRANSFER_SCENE_ID);
    if (transferSceneId) {
        body.transfer_scene_id = transferSceneId;
    }
    const notifyUrl = pickString(params.notify_url);
    if (notifyUrl) {
        body.notify_url = notifyUrl;
    }
    return body;
}

function deriveLocalStatus(batchStatus = '', detailStatus = '') {
    const normalizedBatch = pickString(batchStatus).toUpperCase();
    const normalizedDetail = pickString(detailStatus).toUpperCase();

    if (normalizedDetail === 'SUCCESS') return 'completed';
    if (normalizedDetail === 'FAIL') return 'failed';
    if (normalizedBatch === 'CLOSED') return 'failed';
    if (['WAIT_PAY', 'ACCEPTED', 'PROCESSING', 'INIT'].includes(normalizedDetail) || ['WAIT_PAY', 'ACCEPTED', 'PROCESSING'].includes(normalizedBatch)) {
        return 'processing';
    }
    return 'processing';
}

function buildTransferSyncResult({ batch, detail, source = 'query' } = {}) {
    const batchInfo = batch?.transfer_batch || batch || {};
    const detailInfo = detail?.transfer_detail || detail || {};
    return {
        source,
        batch_id: pickString(batchInfo.batch_id),
        out_batch_no: pickString(batchInfo.out_batch_no),
        batch_status: pickString(batchInfo.batch_status).toUpperCase(),
        detail_id: pickString(detailInfo.detail_id),
        out_detail_no: pickString(detailInfo.out_detail_no),
        detail_status: pickString(detailInfo.detail_status).toUpperCase(),
        fail_reason: pickString(detailInfo.fail_reason || batchInfo.close_reason),
        success_time: pickString(detailInfo.update_time || batchInfo.update_time || batchInfo.create_time),
        transfer_amount: toNumber(detailInfo.transfer_amount, 0) / 100,
        raw_batch: batchInfo,
        raw_detail: detailInfo,
        local_status: deriveLocalStatus(batchInfo.batch_status, detailInfo.detail_status)
    };
}

async function createWithdrawalTransfer(params = {}) {
    const { config, privateKey, publicKey } = await resolveTransferRuntime();
    if (pickString(params.user_name) && !pickString(config.wechat.publicKeyId)) {
        throw new Error('当前环境缺少 PAYMENT_WECHAT_PUBLIC_KEY_ID，不能发起实名微信提现');
    }
    const body = buildBatchPayload({
        ...params,
        appid: config.wechat.appid,
        notify_url: config.wechat.notifyUrl
    }, publicKey);
    const result = await requestWechat({
        method: 'POST',
        requestPath: '/v3/transfer/batches',
        body,
        config,
        privateKey
    });

    return {
        batch_id: pickString(result.batch_id),
        out_batch_no: pickString(result.out_batch_no || body.out_batch_no),
        create_time: pickString(result.create_time),
        transfer_scene_id: pickString(body.transfer_scene_id),
        detail: body.transfer_detail_list[0],
        local_status: 'processing',
        batch_status: 'ACCEPTED',
        raw: result
    };
}

async function queryTransferBatchByBatchId(batchId) {
    const { config, privateKey } = await resolveTransferRuntime();
    if (!batchId) {
        throw new Error('缺少微信提现 batch_id');
    }
    const result = await requestWechat({
        method: 'GET',
        requestPath: `/v3/transfer/batches/batch-id/${encodeURIComponent(batchId)}?need_query_detail=true&offset=0&limit=20&detail_status=ALL`,
        body: null,
        config,
        privateKey
    });
    return result;
}

async function queryWithdrawalTransferStatus(params = {}) {
    const batchId = pickString(params.batch_id);
    const outDetailNo = pickString(params.out_detail_no);
    if (!batchId) {
        throw new Error('缺少微信提现 batch_id，无法同步状态');
    }

    const batchResult = await queryTransferBatchByBatchId(batchId);
    const batchInfo = batchResult?.transfer_batch || {};
    const details = Array.isArray(batchResult?.transfer_detail_list) ? batchResult.transfer_detail_list : [];
    const detailInfo = details.find((item) => pickString(item.out_detail_no) === outDetailNo) || details[0] || {};
    return buildTransferSyncResult({
        batch: batchInfo,
        detail: detailInfo,
        source: 'query'
    });
}

function normalizeServerDateValue(value) {
    return value || db.serverDate();
}

async function patchWithdrawalTransferResult(lookup = {}, transferResult = {}) {
    const outBatchNo = pickString(lookup.out_batch_no || transferResult.out_batch_no);
    if (!outBatchNo) return null;

    const queryRes = await db.collection('withdrawals')
        .where({ wx_out_batch_no: outBatchNo })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
    const current = queryRes.data && queryRes.data[0];
    if (!current || !current._id) return null;

    const localStatus = transferResult.local_status || current.status || 'processing';
    const patch = {
        status: localStatus,
        wx_batch_id: pickString(transferResult.batch_id || current.wx_batch_id),
        wx_out_batch_no: outBatchNo,
        wx_out_detail_no: pickString(transferResult.out_detail_no || current.wx_out_detail_no),
        wx_detail_id: pickString(transferResult.detail_id || current.wx_detail_id),
        wx_batch_status: pickString(transferResult.batch_status || current.wx_batch_status),
        wx_detail_status: pickString(transferResult.detail_status || current.wx_detail_status),
        wx_fail_reason: pickString(transferResult.fail_reason || current.wx_fail_reason),
        wx_transfer_amount: toNumber(transferResult.transfer_amount, current.wx_transfer_amount || current.actual_amount || 0),
        wx_transfer_synced_at: db.serverDate(),
        updated_at: db.serverDate()
    };

    if (localStatus === 'completed') {
        patch.completed_at = normalizeServerDateValue(current.completed_at);
        patch.wx_transfer_success_at = current.wx_transfer_success_at || normalizeServerDateValue(transferResult.success_time);
    }
    if (localStatus === 'failed') {
        patch.failed_at = db.serverDate();
    }
    if (localStatus === 'processing') {
        patch.processing_at = current.processing_at || db.serverDate();
    }

    await db.collection('withdrawals').doc(String(current._id)).update({ data: patch });
    const fresh = await db.collection('withdrawals').doc(String(current._id)).get().then((res) => res.data).catch(() => ({ ...current, ...patch }));
    return fresh;
}

async function handleTransferCallbackNotification(notification = {}) {
    const resource = notification.resource || {};
    const decrypted = notification.decrypted || {};
    const outBatchNo = pickString(decrypted.out_batch_no);
    const batchId = pickString(decrypted.batch_id);

    let transferResult = buildTransferSyncResult({
        batch: {
            batch_id: batchId,
            out_batch_no: outBatchNo,
            batch_status: notification.event_type === 'MCHTRANSFER.BATCH.CLOSED' ? 'CLOSED' : 'FINISHED',
            update_time: decrypted.update_time || notification.create_time || ''
        },
        detail: {},
        source: 'callback'
    });

    if (batchId) {
        try {
            transferResult = await queryWithdrawalTransferStatus({
                batch_id: batchId,
                out_detail_no: pickString(decrypted.out_detail_no)
            });
            transferResult.source = 'callback-query';
        } catch (error) {
            console.error('[WithdrawalTransferCallback] 批次回调后二次查单失败:', error.message);
        }
    }

    const updated = await patchWithdrawalTransferResult({ out_batch_no: outBatchNo }, transferResult);
    return {
        code: 'SUCCESS',
        message: 'Transfer callback processed',
        updated,
        transfer: transferResult,
        notification: {
            event_type: pickString(notification.event_type),
            original_type: pickString(resource.original_type),
            out_batch_no: outBatchNo
        }
    };
}

function shouldSyncWithdrawalRecord(row = {}) {
    if (!row) return false;
    const status = pickString(row.status).toLowerCase();
    if (!['processing', 'approved'].includes(status)) return false;
    if (!pickString(row.wx_batch_id)) return false;
    const syncedAt = new Date(row.wx_transfer_synced_at || row.updated_at || row.processing_at || 0).getTime();
    if (!Number.isFinite(syncedAt) || syncedAt <= 0) return true;
    return (Date.now() - syncedAt) >= BATCH_QUERY_MIN_INTERVAL_MS;
}

module.exports = {
    BATCH_QUERY_MIN_INTERVAL_MS,
    createWithdrawalTransfer,
    queryWithdrawalTransferStatus,
    handleTransferCallbackNotification,
    patchWithdrawalTransferResult,
    shouldSyncWithdrawalRecord,
    deriveLocalStatus,
    buildTransferSyncResult
};
