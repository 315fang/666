'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';
const shouldApply = process.argv.includes('--apply');

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 500;
const WELCOME_TEMPLATE_RE = /注册|见面礼|开运|新人/i;

function assertFileExists(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} 不存在: ${filePath}`);
    }
}

function hasValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object') {
        if (value.$date) return toDate(value.$date);
        if (value.value) return toDate(value.value);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function callMcporter(selector, payload) {
    const result = spawnSync(process.execPath, [
        mcporterCliPath,
        '--config',
        mcporterConfigPath,
        'call',
        selector,
        '--args',
        JSON.stringify(payload),
        '--output',
        'json'
    ], {
        cwd: workspaceRoot,
        encoding: 'utf8'
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);
    }

    const stdout = (result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function readAllDocuments(collectionName) {
    const rows = [];
    let offset = 0;

    while (true) {
        const response = callMcporter('cloudbase.readNoSqlDatabaseContent', {
            collectionName,
            limit: PAGE_LIMIT,
            offset
        });
        const batch = response && Array.isArray(response.data) ? response.data : [];
        rows.push(...batch);
        if (batch.length < PAGE_LIMIT) break;
        offset += batch.length;
    }

    return rows;
}

function updateDocument(collectionName, docId, patch) {
    return callMcporter('cloudbase.writeNoSqlDatabaseContent', {
        action: 'update',
        collectionName,
        query: { _id: docId },
        update: { $set: patch },
        isMulti: false,
        upsert: false
    });
}

function buildTemplateMap(templates) {
    const map = new Map();
    templates.forEach((template) => {
        if (!template) return;
        [template.id, template._id, template.coupon_id]
            .filter(hasValue)
            .forEach((key) => map.set(String(key), template));
    });
    return map;
}

function isWelcomeTemplate(template = {}) {
    const name = String(template.name || template.coupon_name || '');
    return WELCOME_TEMPLATE_RE.test(name);
}

function isUnusedCoupon(coupon = {}) {
    const rawStatus = String(coupon.status || '').toLowerCase();
    if (['used', 'consumed', 'redeemed'].includes(rawStatus)) return false;
    return !coupon.used_at && !coupon.used_order_id && !coupon.order_id;
}

function buildRepairPlan(coupon = {}, templateMap = new Map()) {
    if (!coupon || !coupon._id || !hasValue(coupon.coupon_id)) return null;
    if (!isUnusedCoupon(coupon)) return null;

    const template = templateMap.get(String(coupon.coupon_id));
    if (!template || !isWelcomeTemplate(template)) return null;

    const createdAt = toDate(coupon.created_at);
    const expireAt = toDate(coupon.expire_at || coupon.expires_at || coupon.end_at || coupon.valid_until);
    if (!createdAt || !expireAt) return null;

    const validDays = Math.max(1, Math.floor(toNumber(template.valid_days, 30)));
    const actualDeltaMs = expireAt.getTime() - createdAt.getTime();
    const expectedExpireAt = new Date(createdAt.getTime() + validDays * DAY_MS);
    const expectedDeltaMs = expectedExpireAt.getTime() - createdAt.getTime();

    const shortLived = actualDeltaMs > 0 && actualDeltaMs < DAY_MS;
    const materiallyShorter = expectedDeltaMs - actualDeltaMs > DAY_MS;
    const stillShouldBeValid = expectedExpireAt.getTime() > Date.now();

    if (!shortLived || !materiallyShorter || !stillShouldBeValid) return null;

    return {
        docId: String(coupon._id),
        couponId: String(coupon.coupon_id),
        templateName: template.name || template.coupon_name || '优惠券',
        validDays,
        createdAt: createdAt.toISOString(),
        currentExpireAt: expireAt.toISOString(),
        expectedExpireAt: expectedExpireAt.toISOString()
    };
}

function printSummary(plans, totalCoupons, totalTemplates) {
    const templateCounter = {};
    plans.forEach((plan) => {
        templateCounter[plan.templateName] = (templateCounter[plan.templateName] || 0) + 1;
    });

    console.log(JSON.stringify({
        apply: shouldApply,
        totalTemplates,
        totalCoupons,
        plannedRepairs: plans.length,
        byTemplate: templateCounter,
        samples: plans.slice(0, 10)
    }, null, 2));
}

function main() {
    assertFileExists(mcporterConfigPath, 'mcporter 配置');
    assertFileExists(mcporterCliPath, 'mcporter CLI');

    const templates = readAllDocuments('coupons');
    const coupons = readAllDocuments('user_coupons');
    const templateMap = buildTemplateMap(templates);
    const plans = coupons
        .map((coupon) => buildRepairPlan(coupon, templateMap))
        .filter(Boolean);

    printSummary(plans, coupons.length, templates.length);

    if (!shouldApply) {
        return;
    }

    const results = plans.map((plan) => {
        const response = updateDocument('user_coupons', plan.docId, {
            expire_at: plan.expectedExpireAt,
            updated_at: new Date().toISOString()
        });
        return {
            docId: plan.docId,
            couponId: plan.couponId,
            ok: !!(response && response.success)
        };
    });

    console.log(JSON.stringify({
        apply: true,
        updatedCount: results.filter((item) => item.ok).length,
        failedCount: results.filter((item) => !item.ok).length,
        results
    }, null, 2));
}

main();
