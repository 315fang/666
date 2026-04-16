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
