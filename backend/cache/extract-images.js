const fs = require('fs');
const path = require('path');
const dir = 'c:/Users/21963/WeChatProjects/zz/qianduan';
const assets = {};

function walk(currentDir) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
        const fullPath = path.join(currentDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') walk(fullPath);
        } else if (fullPath.endsWith('.wxml')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const regex = /src=['"]([^'"]+)['"]/g;
            let m;
            while ((m = regex.exec(content)) !== null) {
                const src = m[1];
                if (src.startsWith('/assets/') || src.startsWith('/images/')) {
                    if (!assets[src]) assets[src] = new Set();
                    assets[src].add(fullPath.replace(dir, '').replace(/\\/g, '/'));
                }
            }
        } else if (fullPath.endsWith('.wxss')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const regex = /url\(['"]?([^'"\)]+)['"]?\)/g;
            let m;
            while ((m = regex.exec(content)) !== null) {
                const src = m[1];
                if (src.startsWith('/assets/') || src.startsWith('/images/')) {
                    if (!assets[src]) assets[src] = new Set();
                    assets[src].add(fullPath.replace(dir, '').replace(/\\/g, '/'));
                }
            }
        }
    }
}

walk(dir);
const result = Object.keys(assets).sort().map(k => `${k}\n  -> Used in: ${Array.from(assets[k]).join(', ')}\n`);
console.log(result.join(''));
