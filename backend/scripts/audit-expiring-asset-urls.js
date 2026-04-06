const fs = require('fs');
const path = require('path');
const { Product, Banner, Material, sequelize } = require('../models');
const { analyzeAssetUrl } = require('../utils/assetUrlAudit');

function parseArgs(argv) {
    const args = {
        apply: false,
        output: '',
        limit: 0
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--apply') {
            args.apply = true;
        } else if (arg === '--output') {
            args.output = argv[i + 1] || '';
            i += 1;
        } else if (arg === '--limit') {
            args.limit = Number(argv[i + 1] || 0) || 0;
            i += 1;
        }
    }

    return args;
}

function addFinding(findings, payload) {
    findings.push({
        scope: payload.scope,
        recordId: payload.recordId,
        field: payload.field,
        url: payload.url,
        normalizedUrl: payload.normalizedUrl,
        matchedKeys: payload.matchedKeys,
        autoFixUrl: payload.autoFixUrl || '',
        canAutoFix: !!payload.autoFixUrl
    });
}

function buildStableMaterialIndex(materials) {
    const map = new Map();

    for (const material of materials) {
        for (const field of ['url', 'thumbnail_url']) {
            const raw = String(material[field] || '').trim();
            if (!raw) continue;
            const analyzed = analyzeAssetUrl(raw);
            if (analyzed.isTemporary || !analyzed.normalizedUrl) continue;

            const stableSet = map.get(analyzed.normalizedUrl) || new Set();
            stableSet.add(raw);
            map.set(analyzed.normalizedUrl, stableSet);
        }
    }

    return map;
}

function pickAutoFixUrl(stableIndex, rawUrl) {
    const analyzed = analyzeAssetUrl(rawUrl);
    if (!analyzed.isTemporary || !analyzed.normalizedUrl) return '';

    const candidates = Array.from(stableIndex.get(analyzed.normalizedUrl) || []);
    if (candidates.length !== 1) return '';
    return candidates[0];
}

async function auditProducts(stableIndex, findings, apply, limit) {
    const rows = await Product.findAll({
        order: [['id', 'ASC']],
        ...(limit > 0 ? { limit } : {})
    });

    let updated = 0;

    for (const row of rows) {
        const patch = {};

        for (const field of ['images', 'detail_images']) {
            const urls = Array.isArray(row[field]) ? row[field] : [];
            let changed = false;
            const nextUrls = urls.map((url) => {
                const analyzed = analyzeAssetUrl(url);
                if (!analyzed.isTemporary) return url;

                const autoFixUrl = pickAutoFixUrl(stableIndex, url);
                addFinding(findings, {
                    scope: 'product',
                    recordId: row.id,
                    field,
                    url,
                    normalizedUrl: analyzed.normalizedUrl,
                    matchedKeys: analyzed.matchedKeys,
                    autoFixUrl
                });

                if (apply && autoFixUrl) {
                    changed = true;
                    return autoFixUrl;
                }
                return url;
            });

            if (changed) {
                patch[field] = nextUrls;
            }
        }

        if (apply && Object.keys(patch).length) {
            await row.update(patch);
            updated += 1;
        }
    }

    return updated;
}

async function auditBanners(stableIndex, findings, apply, limit) {
    const rows = await Banner.findAll({
        order: [['id', 'ASC']],
        ...(limit > 0 ? { limit } : {})
    });

    let updated = 0;

    for (const row of rows) {
        const analyzed = analyzeAssetUrl(row.image_url);
        if (!analyzed.isTemporary) continue;

        const autoFixUrl = pickAutoFixUrl(stableIndex, row.image_url);
        addFinding(findings, {
            scope: 'banner',
            recordId: row.id,
            field: 'image_url',
            url: row.image_url,
            normalizedUrl: analyzed.normalizedUrl,
            matchedKeys: analyzed.matchedKeys,
            autoFixUrl
        });

        if (apply && autoFixUrl) {
            await row.update({ image_url: autoFixUrl });
            updated += 1;
        }
    }

    return updated;
}

async function auditMaterials(stableIndex, findings, apply, limit) {
    const rows = await Material.findAll({
        order: [['id', 'ASC']],
        ...(limit > 0 ? { limit } : {})
    });

    let updated = 0;

    for (const row of rows) {
        const patch = {};

        for (const field of ['url', 'thumbnail_url']) {
            const raw = row[field];
            const analyzed = analyzeAssetUrl(raw);
            if (!analyzed.isTemporary) continue;

            const autoFixUrl = pickAutoFixUrl(stableIndex, raw);
            addFinding(findings, {
                scope: 'material',
                recordId: row.id,
                field,
                url: raw,
                normalizedUrl: analyzed.normalizedUrl,
                matchedKeys: analyzed.matchedKeys,
                autoFixUrl
            });

            if (apply && autoFixUrl) {
                patch[field] = autoFixUrl;
            }
        }

        if (apply && Object.keys(patch).length) {
            await row.update(patch);
            updated += 1;
        }
    }

    return updated;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const findings = [];

    try {
        const allMaterials = await Material.findAll({ order: [['id', 'ASC']] });
        const stableIndex = buildStableMaterialIndex(allMaterials);

        const productUpdated = await auditProducts(stableIndex, findings, args.apply, args.limit);
        const bannerUpdated = await auditBanners(stableIndex, findings, args.apply, args.limit);
        const materialUpdated = await auditMaterials(stableIndex, findings, args.apply, args.limit);

        const summary = {
            scannedAt: new Date().toISOString(),
            apply: args.apply,
            totalFindings: findings.length,
            autoFixable: findings.filter((item) => item.canAutoFix).length,
            updated: {
                product: productUpdated,
                banner: bannerUpdated,
                material: materialUpdated
            },
            findings
        };

        if (args.output) {
            const outputPath = path.resolve(process.cwd(), args.output);
            fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
            console.log(`审计结果已写入: ${outputPath}`);
        }

        console.log(JSON.stringify({
            scannedAt: summary.scannedAt,
            apply: summary.apply,
            totalFindings: summary.totalFindings,
            autoFixable: summary.autoFixable,
            updated: summary.updated
        }, null, 2));
    } catch (error) {
        console.error('审计失败:', error);
        process.exitCode = 1;
    } finally {
        await sequelize.close().catch(() => {});
    }
}

main();
