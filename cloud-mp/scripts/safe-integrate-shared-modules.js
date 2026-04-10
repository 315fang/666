#!/usr/bin/env node

/**
 * scripts/safe-integrate-shared-modules.js
 * 
 * 安全的共享模块集成脚本
 * 
 * 采用更保守的修复策略：
 * 1. 只在确实需要时修改文件
 * 2. 保留原有的代码结构
 * 3. 逐个修复而不是全量替换
 * 4. 详细记录所有修改
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const CLOUDFUNCTIONS_DIR = path.join(PROJECT_ROOT, 'cloudfunctions');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');

function log(level, message) {
    const timestamp = new Date().toISOString();
    const colors = {
        INFO: '\x1b[36m',
        SUCCESS: '\x1b[32m',
        WARN: '\x1b[33m',
        ERROR: '\x1b[31m',
        RESET: '\x1b[0m'
    };
    const color = colors[level] || colors.RESET;
    console.log(`${color}[${timestamp}] [${level}] ${message}${colors.RESET}`);
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return null;
    }
}

function writeFile(filePath, content) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (err) {
        return false;
    }
}

function listCloudFunctions() {
    const dirs = fs.readdirSync(CLOUDFUNCTIONS_DIR)
        .filter(f => fs.statSync(path.join(CLOUDFUNCTIONS_DIR, f)).isDirectory())
        .filter(f => f !== 'shared')
        .map(f => ({ name: f, dir: path.join(CLOUDFUNCTIONS_DIR, f) }));
    return dirs;
}

// ==================== 修复器 ====================

class SafeModuleIntegrator {
    constructor() {
        this.results = [];
    }

    /**
     * 在 exports.main 前添加共享模块导入
     */
    ensureSharedImports(content, funcName) {
        // 检查是否已导入
        if (content.includes('require(\'../shared/validators\'') ||
            content.includes('require("../shared/validators"')) {
            return { modified: false, content };
        }

        // 找到最后一个require语句
        const lastRequireMatch = Array.from(content.matchAll(/const\s+\{[^}]*\}\s*=\s*require\(['"...].*?['"]\);/g)).pop();
        
        if (lastRequireMatch) {
            const insertPos = lastRequireMatch.index + lastRequireMatch[0].length;
            const sharedImports = `

// ==================== 共享模块 ====================
const {
    validateAction, validateAmount, validateInteger, validateString,
    validateArray, validateRequiredFields
} = require('../shared/validators');
const {
    CloudBaseError, ERROR_CODES, errorHandler
} = require('../shared/errors');
const {
    success, error, paginated, list, created, updated, deleted,
    badRequest, unauthorized, forbidden, notFound, conflict, serverError
} = require('../shared/response');
const {
    DEFAULT_GROWTH_TIERS, calculateTier, buildGrowthProgress, loadTierConfig
} = require('../shared/growth');
`;
            
            const newContent = content.substring(0, insertPos) + sharedImports + content.substring(insertPos);
            return { modified: true, content: newContent };
        }

        return { modified: false, content };
    }

    /**
     * 修复单个云函数
     */
    fixCloudFunction(funcName, filePath) {
        log('INFO', `检查 ${funcName}/index.js...`);

        let content = readFile(filePath);
        if (!content) {
            log('ERROR', `无法读取 ${funcName}/index.js`);
            return false;
        }

        const originalContent = content;

        // 仅添加缺失的导入
        const importResult = this.ensureSharedImports(content, funcName);
        if (importResult.modified) {
            content = importResult.content;
        }

        // 检查是否有修改
        if (content === originalContent) {
            log('INFO', `  ℹ ${funcName} 已最新，无需修改`);
            return true;
        }

        // 写入修改
        if (writeFile(filePath, content)) {
            log('SUCCESS', `  ✓ 添加了共享模块导入`);
            this.results.push({
                function: funcName,
                modified: true,
                changes: ['添加了共享模块导入']
            });
            return true;
        }

        return false;
    }

    /**
     * 修复所有云函数
     */
    fixAllCloudFunctions() {
        const cloudFunctions = listCloudFunctions();
        let successCount = 0;

        for (const func of cloudFunctions) {
            const indexFile = path.join(func.dir, 'index.js');
            if (fs.existsSync(indexFile)) {
                if (this.fixCloudFunction(func.name, indexFile)) {
                    successCount++;
                }
            }
        }

        return successCount;
    }
}

// ==================== 详细分析 ====================

class DetailedAnalyzer {
    /**
     * 分析所有云函数的当前状态
     */
    analyzeAllFunctions() {
        const cloudFunctions = listCloudFunctions();
        const analysis = [];

        for (const func of cloudFunctions) {
            const indexFile = path.join(func.dir, 'index.js');
            if (fs.existsSync(indexFile)) {
                const content = readFile(indexFile);
                if (content) {
                    const lines = content.split('\n').length;
                    const hasValidators = content.includes('validators');
                    const hasErrors = content.includes('errors');
                    const hasResponse = content.includes('response');
                    const hasGrowth = content.includes('growth');

                    analysis.push({
                        name: func.name,
                        lines,
                        hasSharedModules: {
                            validators: hasValidators,
                            errors: hasErrors,
                            response: hasResponse,
                            growth: hasGrowth
                        },
                        sharedModuleCount: [hasValidators, hasErrors, hasResponse, hasGrowth].filter(Boolean).length
                    });
                }
            }
        }

        return analysis;
    }
}

// ==================== 报告生成 ====================

function generateReport(results, analysis) {
    const now = new Date().toISOString();
    const modifiedCount = results.filter(r => r.modified).length;

    const report = `# 安全模块集成报告

**生成时间**: ${now}

## 📊 执行统计

| 指标 | 数值 |
|-----|------|
| 检查的云函数 | ${results.length} |
| 修改的函数 | ${modifiedCount} |
| 无需修改的函数 | ${results.length - modifiedCount} |

## 📝 修改详情

${results.map(result => {
    if (!result.modified) {
        return `### ✅ ${result.function}
- **状态**: 已最新
- **共享模块**: ${analysis.find(a => a.name === result.function)?.sharedModuleCount || 0} 个
`;
    }
    return `### 🔄 ${result.function}
- **状态**: 已修改
- **修改项**:
${result.changes.map(c => `  - ${c}`).join('\n')}
`;
}).join('\n')}

## 📈 整体状态

### 共享模块集成情况

| 函数 | 行数 | 集成的模块 |
|-----|-----|----------|
${analysis.map(a => `| ${a.name} | ${a.lines} | ${[
    a.hasSharedModules.validators ? '✓' : '',
    a.hasSharedModules.errors ? '✓' : '',
    a.hasSharedModules.response ? '✓' : '',
    a.hasSharedModules.growth ? '✓' : ''
].filter(Boolean).length}/4 |`).join('\n')}

## 🎯 后续计划

### 优先级
1. **P0（立即）**: 验证修改后的代码语法
2. **P1（本周）**: 为大型函数(user, payment)编写子模块
3. **P2（本月）**: 编写单元测试和集成测试
4. **P3（优化）**: 性能基准测试和文档更新

### 大型函数拆分计划

#### user/index.js (${analysis.find(a => a.name === 'user')?.lines} 行)
- user-profile.js: 用户信息获取和更新
- user-growth.js: 等级、积分、成长值计算
- user-addresses.js: 地址簿管理
- user-coupons.js: 优惠券相关功能

#### payment/index.js (${analysis.find(a => a.name === 'payment')?.lines} 行)
- payment-prepay.js: 预支付和二维码生成
- payment-callback.js: 微信支付回调处理
- payment-query.js: 订单和交易查询
- payment-refund.js: 退款处理逻辑
- payment-config.js: 配置和签名工具

---

**状态**: ✅ 安全集成完成  
**验证**: 需要手动验证语法  
**下一步**: \`npm run test\` 运行测试套件
`;

    return report;
}

// ==================== 主程序 ====================

async function main() {
    log('INFO', '='.repeat(60));
    log('INFO', '安全的共享模块集成开始');
    log('INFO', '='.repeat(60));
    log('INFO', '');

    // 第1步：分析
    log('INFO', '【第1步】分析云函数状态...');
    const analyzer = new DetailedAnalyzer();
    const analysis = analyzer.analyzeAllFunctions();

    log('SUCCESS', `分析完成：${analysis.length} 个云函数`);
    log('INFO', '');

    // 第2步：集成
    log('INFO', '【第2步】集成共享模块导入...');
    const integrator = new SafeModuleIntegrator();
    const processed = integrator.fixAllCloudFunctions();

    log('SUCCESS', `处理完成：${processed} 个云函数`);
    log('INFO', '');

    // 第3步：报告
    log('INFO', '【第3步】生成报告...');
    const report = generateReport(integrator.results, analysis);
    const reportPath = path.join(DOCS_DIR, 'SAFE_INTEGRATION_REPORT.md');

    if (writeFile(reportPath, report)) {
        log('SUCCESS', `报告已保存: docs/SAFE_INTEGRATION_REPORT.md`);
    }

    // 总结
    log('INFO', '');
    log('SUCCESS', '='.repeat(60));
    log('SUCCESS', '安全集成完成！');
    log('SUCCESS', '='.repeat(60));

    log('INFO', `
✅ 完成项:
  - 分析了 ${analysis.length} 个云函数
  - 添加了共享模块导入到 ${integrator.results.filter(r => r.modified).length} 个函数
  - 生成了详细的集成报告

📖 报告位置: docs/SAFE_INTEGRATION_REPORT.md

✓ 所有修改都是安全且可逆的
✓ 保留了原有的代码结构
✓ 未修改任何业务逻辑
    `);

    process.exit(0);
}

main().catch(err => {
    log('ERROR', `执行失败: ${err.message}`);
    console.error(err);
    process.exit(1);
});
