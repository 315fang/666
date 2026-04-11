'use strict';

const fs = require('fs');
const path = require('path');

const ORDER_ROOT = path.resolve(__dirname, '..', 'cloudfunctions', 'order');
const SKIP_DIRS = new Set(['node_modules', '.runtime']);
const KEYWORDS = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'throw',
    'new', 'typeof', 'await', 'else', 'do', 'async'
]);
const GLOBALS = new Set([
    'require', 'console', 'Promise', 'String', 'Number', 'Boolean', 'Date', 'Math',
    'Object', 'Array', 'Set', 'Map', 'Error', 'JSON', 'RegExp', 'Buffer', 'process',
    'parseInt', 'parseFloat', 'isFinite', 'setTimeout', 'clearTimeout', 'clearInterval', 'super'
]);

function walk(dir, files = []) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (SKIP_DIRS.has(entry.name)) return;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, files);
            return;
        }
        if (entry.isFile() && fullPath.endsWith('.js')) {
            files.push(fullPath);
        }
    });
    return files;
}

function stripSource(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
        .replace(/`(?:\\.|[^`])*`/g, '``')
        .replace(/'(?:\\.|[^'])*'/g, '\'\'')
        .replace(/"(?:\\.|[^"])*"/g, '""');
}

function addMatches(set, source, regex, transform = (match) => match[1]) {
    for (const match of source.matchAll(regex)) {
        const value = transform(match);
        if (value) set.add(value);
    }
}

function addParamList(set, raw) {
    raw.split(',').forEach((part) => {
        const name = part.trim().replace(/=.*$/, '').trim();
        if (!name) return;
        if (/^[A-Za-z_$][\w$]*$/.test(name)) {
            set.add(name);
        }
    });
}

function collectDeclaredNames(source) {
    const declared = new Set();

    addMatches(declared, source, /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g);
    addMatches(declared, source, /\bclass\s+([A-Za-z_$][\w$]*)\b/g);
    addMatches(declared, source, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g);
    addMatches(declared, source, /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g);
    addMatches(declared, source, /\b(?:async\s*)?\(\s*([^)]*?)\s*\)\s*=>/g, (match) => {
        addParamList(declared, match[1]);
        return null;
    });
    addMatches(declared, source, /\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*?)\)/g, (match) => {
        addParamList(declared, match[1]);
        return null;
    });
    addMatches(declared, source, /(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g);

    for (const match of source.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
        match[1].split(',').forEach((segment) => {
            const cleaned = segment.trim().replace(/=.*$/, '').trim();
            if (!cleaned) return;
            const alias = cleaned.includes(':') ? cleaned.split(':').pop().trim() : cleaned;
            if (/^[A-Za-z_$][\w$]*$/.test(alias)) {
                declared.add(alias);
            }
        });
    }

    return declared;
}

function collectDirectCalls(source) {
    const calls = new Set();
    for (const match of source.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/gm)) {
        const name = match[2];
        if (KEYWORDS.has(name) || GLOBALS.has(name)) continue;
        calls.add(name);
    }
    return calls;
}

function main() {
    const problems = [];

    walk(ORDER_ROOT).forEach((filePath) => {
        const source = stripSource(fs.readFileSync(filePath, 'utf8'));
        const declared = collectDeclaredNames(source);
        const calls = collectDirectCalls(source);
        const missing = [...calls].filter((name) => !declared.has(name)).sort();

        if (missing.length > 0) {
            problems.push({
                filePath,
                missing
            });
        }
    });

    if (problems.length > 0) {
        console.error('[check-order-helper-integrity] Found unresolved direct calls:');
        problems.forEach((problem) => {
            console.error(`- ${path.relative(path.resolve(__dirname, '..'), problem.filePath)} => ${problem.missing.join(', ')}`);
        });
        process.exit(1);
    }

    console.log('[check-order-helper-integrity] OK');
}

main();
