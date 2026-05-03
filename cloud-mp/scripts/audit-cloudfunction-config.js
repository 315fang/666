#!/usr/bin/env node
/**
 * audit-cloudfunction-config.js
 *
 * 暴露 cloud-mp/cloudfunctions/ 下每个云函数的部署配置真相源覆盖情况。
 *
 * 背景（2026-05-03 审计 P1-4）：
 *   CloudBase 部署时一个云函数的最终配置可能来自 3 处：
 *     1. cloudbaserc.json `functions[]` 条目（仓库根，单一仓库视图）
 *     2. cloudfunctions/<name>/config.json（独立部署用）
 *     3. cloudfunctions/<name>/package.json `cloudfunction-config` 字段（CLI 默认读取）
 *
 *   实测发现 13 个云函数中：
 *     - 4 个完全无 memorySize/timeout 配置真相源（cart / login / products / user）
 *       → 重新部署会回退到 CloudBase 默认值（128MB / 3s），业务负载下大概率超时/OOM。
 *     - 多个云函数三处来源潜在不一致（仓库登记 vs CloudBase 控制台手工值）。
 *
 * 本脚本职责：
 *   - 列出每个云函数的当前配置覆盖矩阵。
 *   - 警告无任何 mem/timeout 来源的云函数（视为关键缺口）。
 *   - 警告同一云函数 cloudbaserc 与 package.json 之间 mem/timeout 不一致。
 *   - 默认 warn-only（exit 0），不阻断 CI；可加 `--strict` 让缺口/冲突阻断（用于发布前 check:production）。
 *
 * 使用：
 *   node scripts/audit-cloudfunction-config.js          # warn-only
 *   node scripts/audit-cloudfunction-config.js --strict # 缺口或冲突阻断
 *
 * 输出文件：
 *   docs/audit/generated/CLOUDFUNCTION_CONFIG_COVERAGE.md
 *   docs/audit/generated/CLOUDFUNCTION_CONFIG_COVERAGE.json
 *   （路径走仓库统一约定 scripts/lib/audit-output.js；
 *    可用 CLOUD_MP_AUDIT_OUTPUT_DIR / AUDIT_OUTPUT_DIR 环境变量覆盖。）
 *
 * 详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §P1-4。
 */

const fs = require('fs');
const path = require('path');
const { getAuditArtifactPaths } = require('./lib/audit-output');

const ROOT = path.resolve(__dirname, '..');
const CF_DIR = path.join(ROOT, 'cloudfunctions');
const RC_PATH = path.join(ROOT, 'cloudbaserc.json');
const { outputDir: REPORT_DIR, mdPath: REPORT_MD, jsonPath: REPORT_JSON } =
    getAuditArtifactPaths(ROOT, 'CLOUDFUNCTION_CONFIG_COVERAGE');

const STRICT = process.argv.includes('--strict');

function readJson(p) {
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function listCloudFunctions() {
    return fs.readdirSync(CF_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'shared')
        .map((e) => e.name);
}

function buildRow(name, rcEntry) {
    const cfRoot = path.join(CF_DIR, name);
    const cfgJson = readJson(path.join(cfRoot, 'config.json')) || {};
    const pkgJson = readJson(path.join(cfRoot, 'package.json')) || {};
    const pkgCfg = pkgJson['cloudfunction-config'] || {};

    const sources = {
        cloudbaserc: rcEntry ? {
            memorySize: rcEntry.memorySize ?? null,
            timeout: rcEntry.timeout ?? null,
            triggers: Array.isArray(rcEntry.triggers) ? rcEntry.triggers.length : 0
        } : null,
        config_json: Object.keys(cfgJson).length ? {
            memorySize: cfgJson.memorySize ?? null,
            timeout: cfgJson.timeout ?? null,
            permissions: cfgJson.permissions || null
        } : null,
        package_json: Object.keys(pkgCfg).length ? {
            memorySize: pkgCfg.memorySize ?? null,
            timeout: pkgCfg.timeout ?? null
        } : null
    };

    const memValues = [
        sources.cloudbaserc?.memorySize,
        sources.config_json?.memorySize,
        sources.package_json?.memorySize
    ].filter((v) => v != null);
    const timeoutValues = [
        sources.cloudbaserc?.timeout,
        sources.config_json?.timeout,
        sources.package_json?.timeout
    ].filter((v) => v != null);

    const noMemSource = memValues.length === 0;
    const noTimeoutSource = timeoutValues.length === 0;
    const memConflict = new Set(memValues).size > 1;
    const timeoutConflict = new Set(timeoutValues).size > 1;

    return {
        name,
        sources,
        issues: {
            no_memory_source: noMemSource,
            no_timeout_source: noTimeoutSource,
            memory_conflict: memConflict ? memValues : false,
            timeout_conflict: timeoutConflict ? timeoutValues : false
        }
    };
}

function main() {
    const rc = readJson(RC_PATH) || {};
    const rcByName = new Map((rc.functions || []).map((f) => [f.name, f]));
    const cfNames = listCloudFunctions().sort();

    const rows = cfNames.map((n) => buildRow(n, rcByName.get(n)));

    const criticalGaps = rows.filter((r) => r.issues.no_memory_source || r.issues.no_timeout_source);
    const conflicts = rows.filter((r) => r.issues.memory_conflict || r.issues.timeout_conflict);

    const orphanedRcEntries = (rc.functions || [])
        .map((f) => f.name)
        .filter((n) => !cfNames.includes(n));

    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const json = {
        generated_at: new Date().toISOString(),
        cloud_functions_total: cfNames.length,
        critical_gap_count: criticalGaps.length,
        conflict_count: conflicts.length,
        orphaned_rc_entries: orphanedRcEntries,
        rows
    };
    fs.writeFileSync(REPORT_JSON, JSON.stringify(json, null, 2));

    const md = renderMarkdown(json);
    fs.writeFileSync(REPORT_MD, md);

    console.log(`[audit-cloudfunction-config] total=${cfNames.length} criticalGaps=${criticalGaps.length} conflicts=${conflicts.length} orphanedRc=${orphanedRcEntries.length}`);
    console.log(`  report: ${path.relative(ROOT, REPORT_MD)}`);
    if (criticalGaps.length) {
        console.warn('\n[critical] cloud functions with NO memory/timeout source (will use CloudBase defaults 128MB / 3s):');
        for (const r of criticalGaps) {
            const miss = [];
            if (r.issues.no_memory_source) miss.push('memorySize');
            if (r.issues.no_timeout_source) miss.push('timeout');
            console.warn(`  - ${r.name}: missing ${miss.join(', ')}`);
        }
    }
    if (conflicts.length) {
        console.warn('\n[conflict] cloud functions with inconsistent values across cloudbaserc/config.json/package.json:');
        for (const r of conflicts) {
            if (r.issues.memory_conflict) console.warn(`  - ${r.name}: memorySize values = ${JSON.stringify(r.issues.memory_conflict)}`);
            if (r.issues.timeout_conflict) console.warn(`  - ${r.name}: timeout values = ${JSON.stringify(r.issues.timeout_conflict)}`);
        }
    }
    if (orphanedRcEntries.length) {
        console.warn(`\n[orphaned] cloudbaserc.json lists functions that have no cloudfunctions/<name>/ directory: ${JSON.stringify(orphanedRcEntries)}`);
    }

    if (STRICT && (criticalGaps.length || conflicts.length || orphanedRcEntries.length)) {
        console.error('\n[strict] one or more issues found; exiting non-zero.');
        process.exit(1);
    }
}

function renderMarkdown(report) {
    const lines = [];
    lines.push('# cloud-mp 云函数部署配置覆盖审计');
    lines.push('');
    lines.push(`生成时间：${report.generated_at}`);
    lines.push(`云函数总数：${report.cloud_functions_total}`);
    lines.push(`关键缺口：${report.critical_gap_count}（无 mem/timeout 真相源）`);
    lines.push(`配置冲突：${report.conflict_count}`);
    lines.push(`cloudbaserc 孤儿条目：${report.orphaned_rc_entries.length}`);
    lines.push('');
    lines.push('## 配置覆盖矩阵');
    lines.push('');
    lines.push('| 云函数 | cloudbaserc mem/timeout | config.json mem/timeout | package.json mem/timeout | 问题 |');
    lines.push('|---|---|---|---|---|');
    for (const r of report.rows) {
        const fmt = (s) => s ? `${s.memorySize ?? '-'} / ${s.timeout ?? '-'}` : '—';
        const issues = [];
        if (r.issues.no_memory_source) issues.push('❌ 无 mem 源');
        if (r.issues.no_timeout_source) issues.push('❌ 无 timeout 源');
        if (r.issues.memory_conflict) issues.push(`⚠️ mem 冲突 ${JSON.stringify(r.issues.memory_conflict)}`);
        if (r.issues.timeout_conflict) issues.push(`⚠️ timeout 冲突 ${JSON.stringify(r.issues.timeout_conflict)}`);
        lines.push(`| \`${r.name}\` | ${fmt(r.sources.cloudbaserc)} | ${fmt(r.sources.config_json)} | ${fmt(r.sources.package_json)} | ${issues.join(' ; ') || '✓'} |`);
    }
    if (report.orphaned_rc_entries.length) {
        lines.push('');
        lines.push('## cloudbaserc 孤儿条目');
        lines.push('');
        for (const n of report.orphaned_rc_entries) {
            lines.push(`- \`${n}\`：cloudbaserc.json 登记但 cloudfunctions/ 下无对应目录`);
        }
    }
    lines.push('');
    lines.push('## 治理建议');
    lines.push('');
    lines.push('1. 对「关键缺口」云函数，从 CloudBase 控制台获取**当前线上 memorySize / timeout 实际值**，');
    lines.push('   写入对应 `cloudfunctions/<name>/package.json` 的 `cloudfunction-config` 字段。');
    lines.push('   切忌凭印象写默认值——若仓库值低于线上值，下次部署会**降级**性能。');
    lines.push('2. 对「配置冲突」云函数，确认哪一处是真相源（一般以 cloudbaserc 为最高优先级，');
    lines.push('   因为 CLI 部署 `--all` 时会覆盖各 mirror）。把不一致来源对齐。');
    lines.push('3. 对「孤儿条目」要么补回云函数目录，要么从 cloudbaserc 删除。');
    lines.push('');
    lines.push('详见：`cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md` §P1-4。');
    return lines.join('\n') + '\n';
}

main();
