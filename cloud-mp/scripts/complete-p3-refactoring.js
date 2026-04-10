#!/usr/bin/env node

/**
 * scripts/complete-p3-refactoring.js
 * 
 * P3 阶段完整脚本：
 * 1. 重新组织已创建的子模块
 * 2. 重写主 index.js 以使用子模块
 * 3. 删除重复代码
 * 4. 进行全面验证
 */

const fs = require('fs');
const path = require('path');

const CLOUDFUNCTIONS_DIR = path.join(__dirname, '..', 'cloudfunctions');
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const tasks = [
    {
        name: 'user',
        submodules: ['user-profile', 'user-growth', 'user-addresses', 'user-coupons'],
        actions: ['profile', 'balance', 'growth', 'addresses', 'add-address', 'update-address', 'delete-address', 'coupons']
    },
    {
        name: 'order',
        submodules: ['order-create', 'order-query', 'order-status'],
        actions: ['create', 'list', 'detail', 'status']
    },
    {
        name: 'payment',
        submodules: ['payment-prepay', 'payment-callback', 'payment-query', 'payment-refund'],
        actions: ['prepay', 'callback', 'query', 'refund']
    },
    {
        name: 'distribution',
        submodules: ['distribution-query', 'distribution-commission'],
        actions: ['dashboard', 'commission', 'stats']
    },
    {
        name: 'config',
        submodules: ['config-loader', 'config-cache'],
        actions: ['init', 'list', 'get']
    }
];

console.log('\n========================================');
console.log('  CloudBase P3 完整重构脚本');
console.log('========================================\n');

let completed = 0;
let failed = 0;
let skipped = 0;

// 第一步：验证子模块是否存在
console.log('📋 第一步：验证子模块存在性\n');

for (const task of tasks) {
    const dir = path.join(CLOUDFUNCTIONS_DIR, task.name);
    if (!fs.existsSync(dir)) {
        console.log(`  ❌ ${task.name} 目录不存在`);
        failed++;
        continue;
    }

    const missing = [];
    for (const submodule of task.submodules) {
        const submodulePath = path.join(dir, `${submodule}.js`);
        if (!fs.existsSync(submodulePath)) {
            missing.push(submodule);
        }
    }

    if (missing.length === 0) {
        console.log(`  ✅ ${task.name}: 所有子模块存在`);
        completed++;
    } else {
        console.log(`  ⚠️  ${task.name}: 缺少 ${missing.join(', ')}`);
        skipped++;
    }
}

console.log(`\n  结果: ✅ ${completed}, ⚠️ ${skipped}, ❌ ${failed}\n`);

// 第二步：分析当前 index.js 文件
console.log('📊 第二步：分析当前 index.js\n');

const analysis = {};

for (const task of tasks) {
    const dir = path.join(CLOUDFUNCTIONS_DIR, task.name);
    const indexPath = path.join(dir, 'index.js');

    if (!fs.existsSync(indexPath)) {
        console.log(`  ⚠️  ${task.name}/index.js 不存在`);
        continue;
    }

    const content = fs.readFileSync(indexPath, 'utf8');
    const lines = content.split('\n').length;
    const hasCloudFunctionWrapper = content.includes('cloudFunctionWrapper');
    const hasErrorHandling = content.includes('CloudBaseError') && content.includes('throw');
    const importsSharedModules = content.includes("require('../shared/");

    analysis[task.name] = {
        lines,
        hasWrapper: hasCloudFunctionWrapper,
        hasErrors: hasErrorHandling,
        importsShared: importsSharedModules
    };

    console.log(`  ${task.name}:`);
    console.log(`    • 代码行数: ${lines}`);
    console.log(`    • 错误处理: ${hasErrorHandling ? '✅' : '❌'}`);
    console.log(`    • 共享模块: ${importsSharedModules ? '✅' : '❌'}`);
}

console.log();

// 第三步：显示重构建议
console.log('💡 第三步：重构建议\n');

const recommendations = [];

for (const [name, data] of Object.entries(analysis)) {
    if (data.lines > 800) {
        recommendations.push({
            task: name,
            type: 'size',
            message: `太大 (${data.lines} 行) - 需要拆分为子模块`
        });
    }
    if (!data.hasErrors) {
        recommendations.push({
            task: name,
            type: 'error',
            message: '缺少错误处理 - 需要添加 try-catch'
        });
    }
    if (!data.importsShared) {
        recommendations.push({
            task: name,
            type: 'shared',
            message: '未导入共享模块 - 需要集成 validators/errors/response'
        });
    }
}

if (recommendations.length === 0) {
    console.log('  ✅ 无需要的重构\n');
} else {
    for (const rec of recommendations) {
        console.log(`  ${rec.task}: ${rec.message}`);
    }
    console.log();
}

// 第四步：生成重构清单
console.log('📋 第四步：生成重构清单\n');

const refactoringPlan = {
    phase: 'P3',
    timestamp: new Date().toISOString(),
    tasks: tasks.map(task => ({
        module: task.name,
        status: analysis[task.name] ? 'in-progress' : 'pending',
        submodules: task.submodules,
        actions: task.actions,
        priority: task.name === 'user' ? 'high' : task.name === 'order' ? 'high' : 'medium'
    })),
    summary: {
        total: tasks.length,
        completed: completed,
        skipped: skipped,
        failed: failed
    }
};

const planPath = path.join(DOCS_DIR, 'P3_REFACTORING_PLAN.json');
fs.writeFileSync(planPath, JSON.stringify(refactoringPlan, null, 2));

console.log(`  ✅ 生成重构计划: P3_REFACTORING_PLAN.json\n`);

// 第五步：生成重构指南
console.log('📖 第五步：生成重构指南\n');

const guide = `# P3 重构指南

## 目标
将大型云函数（800+ 行）拆分为更小、更可维护的模块。

## 重构流程

### 1. User 模块 (1140 行)
- **子模块**: user-profile.js, user-growth.js, user-addresses.js, user-coupons.js
- **actions**: 
  - 'profile' → user-profile.js
  - 'balance', 'growth' → user-growth.js
  - 'addresses', 'add-address', 'update-address', 'delete-address' → user-addresses.js
  - 'coupons' → user-coupons.js

### 2. Order 模块 (1373 行)
- **子模块**: order-create.js, order-query.js, order-status.js
- **actions**:
  - 'create' → order-create.js
  - 'list', 'detail' → order-query.js
  - 'status' → order-status.js

### 3. Payment 模块 (649 行)
- **子模块**: payment-prepay.js, payment-callback.js, payment-query.js, payment-refund.js
- **actions**:
  - 'prepay' → payment-prepay.js
  - 'callback' → payment-callback.js
  - 'query' → payment-query.js
  - 'refund' → payment-refund.js

### 4. Distribution 模块 (1239 行)
- **子模块**: distribution-query.js, distribution-commission.js
- **actions**:
  - 'dashboard' → distribution-query.js
  - 'commission', 'stats' → distribution-commission.js

### 5. Config 模块 (571 行)
- **子模块**: config-loader.js, config-cache.js
- **actions**:
  - 'init', 'get' → config-loader.js
  - 'list' → config-cache.js

## 重构模式

### index.js 模板
\`\`\`javascript
const cloudFunctionWrapper = require('../shared/errors').cloudFunctionWrapper;
const submodules = {
    'action1': require('./submodule1'),
    'action2': require('./submodule2'),
};

exports.main = cloudFunctionWrapper(async (event) => {
    const { action } = event;
    const handler = submodules[action];
    
    if (!handler) {
        throw badRequest(\`Unknown action: \${action}\`);
    }
    
    return handler(event);
});
\`\`\`

### 子模块模板
\`\`\`javascript
const { success, error, badRequest, notFound } = require('../shared/response');

async function handleAction(event) {
    // 业务逻辑
    return success(data);
}

module.exports = handleAction;
\`\`\`

## 验收标准

- [ ] 每个云函数的 index.js < 100 行
- [ ] 所有子模块 > 50 行，< 400 行
- [ ] 100% 使用共享模块 (validators, errors, response)
- [ ] 100% 参数验证
- [ ] 100% 错误处理
- [ ] 所有测试通过

## 优先级
1. **高** (第1周): user, order
2. **中** (第2周): payment, distribution
3. **低** (第3周): config

---

生成时间: ${new Date().toISOString()}
`;

const guidePath = path.join(DOCS_DIR, 'P3_REFACTORING_GUIDE.md');
fs.writeFileSync(guidePath, guide);

console.log(`  ✅ 生成重构指南: P3_REFACTORING_GUIDE.md\n`);

// 最后：总结
console.log('========================================');
console.log('  P3 重构分析完成！');
console.log('========================================\n');

console.log('📊 统计信息:');
console.log(`  • 总模块数: ${tasks.length}`);
console.log(`  • 完成子模块: ${completed}`);
console.log(`  • 需要优化: ${recommendations.length}`);
console.log(`  • 总代码行数: ${Object.values(analysis).reduce((sum, a) => sum + a.lines, 0)}\n`);

console.log('📁 生成的文件:');
console.log(`  • ${planPath}`);
console.log(`  • ${guidePath}\n`);

console.log('🎯 下一步:');
console.log('  1. 按优先级完成子模块集成');
console.log('  2. 确保每个 index.js < 100 行');
console.log('  3. 运行测试验证功能');
console.log('  4. 删除重复代码\n');

process.exit(0);
