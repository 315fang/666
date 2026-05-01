#!/usr/bin/env node
/**
 * 将 cloudfunctions/shared/ 中已确认同源的模块同步到每个云函数目录下。
 *
 * 默认只同步保守白名单，避免覆盖已有领域差异的 shared 模块。
 *
 * 用法:
 *   node scripts/sync-shared.js
 *   node scripts/sync-shared.js --check
 *   node scripts/sync-shared.js --all
 *   node scripts/sync-shared.js --files=response.js,utils.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CF_DIR = path.join(ROOT, 'cloudfunctions');
const SHARED_DIR = path.join(CF_DIR, 'shared');

const DEFAULT_MANAGED_SHARED_FILES = [
    'agent-config.js',
    'goods-fund-transfer.js',
    'growth.js',
    'response.js',
    'utils.js',
    'validators.js'
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const syncAll = args.includes('--all');
const filesArg = args.find((arg) => arg.startsWith('--files='));

function listSharedFiles() {
    if (filesArg) {
        return filesArg
            .slice('--files='.length)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    if (syncAll) {
        return fs.readdirSync(SHARED_DIR).filter((f) => f.endsWith('.js'));
    }
    return DEFAULT_MANAGED_SHARED_FILES;
}

// 需要同步的 shared 文件
const SHARED_FILES = listSharedFiles().filter((file) => {
    const exists = fs.existsSync(path.join(SHARED_DIR, file));
    if (!exists) console.warn(`[warn] missing source shared file: ${file}`);
    return exists;
});

// 获取所有云函数目录（排除 shared 本身）
const CF_SUBDIRS = fs.readdirSync(CF_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared')
    .map(d => d.name);

let totalCopied = 0;
let totalPatched = 0;
let totalChecked = 0;
const mismatches = [];

for (const cfName of CF_SUBDIRS) {
    const cfPath = path.join(CF_DIR, cfName);
    const sharedDest = path.join(cfPath, 'shared');
    let functionChecked = 0;

    // 1. 创建 shared 目录（如果不存在）
    if (!fs.existsSync(sharedDest) && !checkOnly) {
        fs.mkdirSync(sharedDest, { recursive: true });
    }

    // 2. 复制 shared 文件
    for (const file of SHARED_FILES) {
        const src = path.join(SHARED_DIR, file);
        const dest = path.join(sharedDest, file);
        if (checkOnly) {
            if (fs.existsSync(dest)) {
                functionChecked++;
                totalChecked++;
                const srcContent = fs.readFileSync(src, 'utf8');
                const destContent = fs.readFileSync(dest, 'utf8');
                if (srcContent !== destContent) {
                    mismatches.push(path.relative(ROOT, dest));
                }
            }
        } else {
            fs.copyFileSync(src, dest);
            totalCopied++;
        }
    }

    // 3. 遍历云函数目录下所有 .js 文件，替换 require 路径
    if (!checkOnly) {
        const jsFiles = getAllJsFiles(cfPath);
        for (const jsFile of jsFiles) {
            let content = fs.readFileSync(jsFile, 'utf-8');
            const original = content;

            // 替换 ../shared/ → ./shared/
            content = content.replace(/require\(['"]\.\.\/shared\//g, "require('./shared/");

            if (content !== original) {
                fs.writeFileSync(jsFile, content, 'utf-8');
                totalPatched++;
                console.log(`  [patch] ${path.relative(ROOT, jsFile)}`);
            }
        }
    }

    const fileCount = checkOnly ? functionChecked : SHARED_FILES.length;
    console.log(`[${checkOnly ? 'check' : 'sync'}] ${cfName}/shared/ ← ${fileCount} files`);
}

if (checkOnly && mismatches.length > 0) {
    console.error(`\nShared module check failed. ${mismatches.length}/${totalChecked} mirrored files differ from cloudfunctions/shared/:`);
    mismatches.forEach((file) => console.error(`  - ${file}`));
    process.exit(1);
}

if (checkOnly) {
    console.log(`\nDone! Checked ${totalChecked} mirrored files, all managed shared modules match.`);
} else {
    console.log(`\nDone! Copied ${totalCopied} files, patched ${totalPatched} files.`);
}

function getAllJsFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        // 跳过 shared 目录本身（已复制，不需要再 patch）
        if (entry.name === 'shared') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}
