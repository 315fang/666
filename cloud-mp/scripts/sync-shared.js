#!/usr/bin/env node
/**
 * 将 cloudfunctions/shared/ 同步到每个云函数目录下
 * 并将 require('../shared/xxx') 替换为 require('./shared/xxx')
 * 
 * 用法: node scripts/sync-shared.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CF_DIR = path.join(ROOT, 'cloudfunctions');
const SHARED_DIR = path.join(CF_DIR, 'shared');

// 需要同步的 shared 文件
const SHARED_FILES = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.js'));

// 获取所有云函数目录（排除 shared 本身）
const CF_SUBDIRS = fs.readdirSync(CF_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'shared')
    .map(d => d.name);

let totalCopied = 0;
let totalPatched = 0;

for (const cfName of CF_SUBDIRS) {
    const cfPath = path.join(CF_DIR, cfName);
    const sharedDest = path.join(cfPath, 'shared');

    // 1. 创建 shared 目录（如果不存在）
    if (!fs.existsSync(sharedDest)) {
        fs.mkdirSync(sharedDest, { recursive: true });
    }

    // 2. 复制 shared 文件
    for (const file of SHARED_FILES) {
        const src = path.join(SHARED_DIR, file);
        const dest = path.join(sharedDest, file);
        fs.copyFileSync(src, dest);
        totalCopied++;
    }

    // 3. 遍历云函数目录下所有 .js 文件，替换 require 路径
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

    console.log(`[sync] ${cfName}/shared/ ← ${SHARED_FILES.length} files`);
}

console.log(`\nDone! Copied ${totalCopied} files, patched ${totalPatched} files.`);

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
