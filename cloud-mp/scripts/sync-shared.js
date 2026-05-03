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

// 2026-05-03 治理后：默认管理 cloudfunctions/shared/ 下**全部** .js 文件。
//
// 历史上这里维护过一份 6 个文件的保守白名单（DEFAULT_MANAGED_SHARED_FILES），
// 结果造成 4 个白名单外文件（errors / asset-url / directed-invite / pickup-station-stock）
// 在多个云函数 mirror 中累计漂移 9 处、共数百行业务逻辑无机制保护。详见
// cloud-mp/docs/audit/2026-05-03-comprehensive-code-review.md §3 P1-3。
//
// 收口后规则：所有 cloudfunctions/shared/*.js 都视为统一治理对象；
// 加新 shared 模块无需再改本脚本，自动纳入管理。--all 旗标保留向后兼容（已为 noop）。
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const filesArg = args.find((arg) => arg.startsWith('--files='));

function listSharedFiles() {
    if (filesArg) {
        return filesArg
            .slice('--files='.length)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return fs.readdirSync(SHARED_DIR).filter((f) => f.endsWith('.js'));
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

    // 1. 仅对**已存在 shared 目录**的云函数做同步。
    //    不再自动 mkdir：是否需要 shared 镜像应由开发者 `mkdir cloudfunctions/<name>/shared`
    //    显式声明，作为「该云函数从此开始用 shared 镜像」的信号。
    //    （2026-05-03 修：之前的 mkdir 行为意外为 commission-deadline-process /
    //    order-auto-confirm / visitor-account-cleanup 这类无 require 的定时器云函数
    //    凭空创建了一堆 mirror 文件，造成仓库膨胀。）
    if (!fs.existsSync(sharedDest)) {
        if (!checkOnly) console.log(`[skip] ${cfName}/shared/ ← no shared dir, skipped`);
        continue;
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
        // 跳过 test/：测试位于云函数子目录内，`require('../shared/...')` 是**正确**路径，
        //   不能被改成 `./shared/...`（否则会指向不存在的 test/shared/）。
        //   2026-05-03 治理时实际遇到这个 bug，三个 test 文件被错误 patch。
        // 跳过 node_modules：第三方代码不属于我们维护范畴。
        if (entry.name === 'shared' || entry.name === 'test' || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}
