/**
 * 2026-05-03 审计（Stage 3.10）：filesystem provider 在生产**非主路径**。
 *
 * 实际定位：
 *   - 当 dataSource='filesystem' 时是独立 store——但生产被 enforceCloudbaseRuntime 拦截，永不命中。
 *   - cloudbase.js 在 envId 缺失时构造的"应急 store"用本 provider 提供 singleton 读写
 *     （参见 cloudbase.js line 132-174）；生产 admin-api 在云函数中运行，envId 必存在，应急路径冷。
 *   - mysql.js 内部用本 provider 做 cache/fallback；mysql 路径本身已 deprecated。
 *
 * 不能删的原因：
 *   - cloudbase.js 与 mysql.js 顶层均 require 本文件，删了会破 module 解析。
 *   - 应急 fallbackStore 在配置异常时仍是有用的安全网（避免直接崩在请求路径上）。
 *
 * 策略：保留代码不动，仅以本注释明确角色。Stage 4 物理清理 mysql 路径后再评估是否
 * 收敛进 cloudbase 内部 helper。详见 cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md。
 */
const path = require('path');
const fs = require('fs');

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return fallback;
    }
}

function writeJsonFile(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readJsonlCollection(root, name) {
    const filePath = path.join(root, `${name}.json`);
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function readJsonArrayCollection(root, name) {
    const filePath = path.join(root, `${name}.json`);
    if (!fs.existsSync(filePath)) return null;
    const parsed = readJsonFile(filePath, null);
    return Array.isArray(parsed) ? parsed : null;
}

function createFilesystemStore(options) {
    const {
        dataRoot,
        normalizedDataRoot,
        runtimeRoot,
        preferNormalizedData = true,
        singletonRoot = runtimeRoot
    } = options;
    const overridesRoot = path.join(runtimeRoot, 'overrides');
    let lastReloadAt = null;

    function getCollection(name) {
        const overridePath = path.join(overridesRoot, `${name}.json`);
        const override = readJsonFile(overridePath, null);
        if (Array.isArray(override)) return override;
        if (preferNormalizedData) {
            const normalized = readJsonArrayCollection(normalizedDataRoot, name);
            if (normalized) return normalized;
        }
        return readJsonlCollection(dataRoot, name);
    }

    function saveCollection(name, rows) {
        writeJsonFile(path.join(overridesRoot, `${name}.json`), rows);
    }

    function getSingleton(name, fallback) {
        const override = readJsonFile(path.join(singletonRoot, 'overrides', `${name}.json`), null);
        if (override && typeof override === 'object') return override;
        return fallback;
    }

    function saveSingleton(name, value) {
        writeJsonFile(path.join(singletonRoot, 'overrides', `${name}.json`), value);
    }

    return {
        kind: 'filesystem',
        description: '文件种子 + runtime override',
        readyPromise: Promise.resolve(),
        async flush() {
            return { success: true };
        },
        health() {
            return {
                status: 'ok',
                mode: 'filesystem',
                ready: true,
                data_root: dataRoot,
                normalized_data_root: normalizedDataRoot,
                runtime_root: runtimeRoot,
                singleton_root: singletonRoot,
                cached_collections: 0,
                dirty_collections: [],
                pending_flush_collections: [],
                loaded_at: null,
                last_reload_at: lastReloadAt,
                last_error: null,
                warnings: []
            };
        },
        describe() {
            return {
                source: 'filesystem',
                collection_source: 'filesystem',
                singleton_source: 'filesystem',
                prefer_normalized_data: preferNormalizedData
            };
        },
        getCollection,
        async reloadCollection(name) {
            lastReloadAt = new Date().toISOString();
            return getCollection(name);
        },
        async reloadCollections(names = []) {
            lastReloadAt = new Date().toISOString();
            return Promise.all((Array.isArray(names) ? names : []).map((name) => getCollection(name)));
        },
        saveCollection,
        getSingleton,
        saveSingleton
    };
}

module.exports = {
    createFilesystemStore
};
