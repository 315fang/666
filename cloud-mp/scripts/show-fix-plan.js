#!/usr/bin/env node

/**
 * 🔧 全量修复执行计划
 * 
 * 本脚本定义了所有需要修复的问题及其修复策略
 * 优先级：P1 > P2 > 优化建议
 */

const fs = require('fs');
const path = require('path');

const FIXES = [
    // ========== P1 问题（已完成）==========
    {
        id: 'P1-1',
        title: '代理订单权限越权',
        status: '✅ 已修复',
        files: ['cloudfunctions/distribution/index.js'],
        lines: '950-965',
        priority: 'P1',
        risk: '🔴 高',
        description: '高级代理可查看全量订单导致数据泄露'
    },
    {
        id: 'P1-2',
        title: '订单字段污染 (buyer_id)',
        status: '✅ 已修复',
        files: ['cloudfunctions/order/index.js'],
        lines: '668, 1013',
        priority: 'P1',
        risk: '🔴 高',
        description: '新订单仍写入废弃 buyer_id 字段'
    },
    {
        id: 'P1-3',
        title: '发布门禁假阳性',
        status: '✅ 已修复',
        files: ['scripts/check-production-gaps.js'],
        lines: '35-95',
        priority: 'P1',
        risk: '🔴 高',
        description: '门禁脚本存在字段读取错误和完整性缺陷'
    },

    // ========== P2 问题 ==========
    {
        id: 'P2-1',
        title: '云函数体积过大',
        status: '📋 待修复',
        files: ['cloudfunctions/user/index.js', 'cloudfunctions/payment/index.js'],
        priority: 'P2',
        risk: '🟡 中',
        description: '单个文件超过 700 行，应拆分为子模块',
        lines: '1-1230, 1-743'
    },
    {
        id: 'P2-2',
        title: '重复代码逻辑',
        status: '📋 待修复',
        files: ['cloudfunctions/login/index.js', 'cloudfunctions/user/index.js'],
        priority: 'P2',
        risk: '🟡 中',
        description: '等级计算逻辑和常量重复定义',
        solution: '提取到 cloudfunctions/shared/ 目录'
    },
    {
        id: 'P2-3',
        title: '缺少输入验证',
        status: '📋 待修复',
        files: ['cloudfunctions/config/index.js', 'cloudfunctions/order/index.js'],
        priority: 'P2',
        risk: '🟡 中',
        description: 'action 参数和用户输入缺少验证'
    },
    {
        id: 'P2-4',
        title: '错误处理不统一',
        status: '📋 待修复',
        files: ['cloudfunctions/*'],
        priority: 'P2',
        risk: '🟡 中',
        description: '不同云函数错误返回格式混乱',
        solution: '创建统一的错误处理工具'
    },

    // ========== 优化建议 ==========
    {
        id: 'OPT-1',
        title: '添加单元测试',
        status: '📋 待规划',
        files: ['tests/'],
        priority: '优化',
        risk: '⚪ 低',
        description: '当前项目无单元测试覆盖'
    },
    {
        id: 'OPT-2',
        title: '缺少日志系统',
        status: '📋 待规划',
        files: ['cloudfunctions/shared/logger.js'],
        priority: '优化',
        risk: '⚪ 低',
        description: '缺少结构化日志和追踪系统'
    },
    {
        id: 'OPT-3',
        title: '缺少速率限制',
        status: '📋 待规划',
        files: ['cloudfunctions/shared/rateLimit.js'],
        priority: '优化',
        risk: '⚪ 低',
        description: '云函数无请求频率限制'
    }
];

const report = `
# 🔧 全量修复执行计划报告

**生成时间**: ${new Date().toISOString()}

---

## 📊 修复进度统计

### 总体数据
- 🔴 P1 问题: 3 个 (✅ 3 个已修复)
- 🟡 P2 问题: 4 个 (📋 4 个待修复)
- ⚪ 优化建议: 3 个 (📋 3 个待规划)

### 进度条
\`\`\`
P1 问题:   ████████████████████ 100% (3/3)
P2 问题:   ░░░░░░░░░░░░░░░░░░░░  0% (0/4)
优化建议:  ░░░░░░░░░░░░░░░░░░░░  0% (0/3)

总体:      ████████░░░░░░░░░░░░ 30% (3/10)
\`\`\`

---

## 🎯 按优先级分类

### 🔴 P1 问题（已完成）

${FIXES.filter(f => f.priority === 'P1').map(f => `
#### ${f.id}: ${f.title} [${f.status}]

- **文件**: ${f.files.join(', ')}
- **行号**: ${f.lines || '多处'}
- **风险**: ${f.risk}
- **描述**: ${f.description}
`).join('\n')}

### 🟡 P2 问题（待修复）

${FIXES.filter(f => f.priority === 'P2').map((f, idx) => `
#### P2-${idx + 1}: ${f.title}

- **文件**: ${f.files.join(', ')}
- **风险**: ${f.risk}
- **描述**: ${f.description}
${f.solution ? `- **方案**: ${f.solution}` : ''}
`).join('\n')}

### ⚪ 优化建议（待规划）

${FIXES.filter(f => f.priority === '优化').map((f, idx) => `
#### OPT-${idx + 1}: ${f.title}

- **文件**: ${f.files.join(', ')}
- **描述**: ${f.description}
`).join('\n')}

---

## 🚀 修复执行顺序

### 第一批（P2 关键修复）- 本周完成

1. **P2-2**: 提取共享代码
   - 创建 \`cloudfunctions/shared/growth.js\`
   - 创建 \`cloudfunctions/shared/validators.js\`
   - 在 login, user 中引用共享模块

2. **P2-3**: 添加输入验证
   - config 云函数: 验证 action 参数
   - order 云函数: 验证金额和数量
   - user 云函数: 验证地址、优惠券参数

3. **P2-4**: 统一错误处理
   - 创建 \`cloudfunctions/shared/errors.js\`
   - 创建 \`cloudfunctions/shared/response.js\`
   - 更新所有云函数返回格式

### 第二批（P2 代码整理）- 2 周内完成

4. **P2-1**: 拆分大型云函数
   - \`user/index.js\` → \`user-profile.js\`, \`user-address.js\`, \`user-coupon.js\`
   - \`payment/index.js\` → \`payment-prepay.js\`, \`payment-callback.js\`

### 第三批（优化建议）- 1 个月内完成

5. **OPT-2**: 日志系统
6. **OPT-3**: 速率限制
7. **OPT-1**: 单元测试

---

## 📋 修复清单

| ID | 标题 | 优先级 | 状态 | 预计时间 |
|----|------|--------|------|---------|
| P1-1 | 代理订单权限越权 | P1 | ✅ 已修复 | - |
| P1-2 | 订单字段污染 | P1 | ✅ 已修复 | - |
| P1-3 | 发布门禁假阳性 | P1 | ✅ 已修复 | - |
| P2-2 | 代码重复 | P2 | 📋 待修复 | 1 天 |
| P2-3 | 输入验证 | P2 | 📋 待修复 | 1 天 |
| P2-4 | 错误处理 | P2 | 📋 待修复 | 1 天 |
| P2-1 | 函数拆分 | P2 | 📋 待修复 | 2 天 |
| OPT-1 | 单元测试 | 优化 | 📋 待规划 | 5 天 |
| OPT-2 | 日志系统 | 优化 | 📋 待规划 | 3 天 |
| OPT-3 | 速率限制 | 优化 | 📋 待规划 | 2 天 |

---

## 💡 修复思路

### 1. 代码重复提取（P2-2）
\`\`\`javascript
// 创建 cloudfunctions/shared/growth.js
module.exports = {
    DEFAULT_GROWTH_TIERS: [...],
    buildGrowthProgress: function(...) {...}
};

// 在 login 和 user 中引用
const { buildGrowthProgress } = require('../shared/growth');
\`\`\`

### 2. 输入验证（P2-3）
\`\`\`javascript
// 创建 cloudfunctions/shared/validators.js
module.exports = {
    validateAction(action, allowed) {
        if (!allowed.includes(action)) {
            throw new Error(\`Invalid action: \${action}\`);
        }
    },
    validateAmount(value, min = 0.01) {
        const num = Number(value);
        if (!Number.isFinite(num) || num < min) {
            throw new Error(\`Invalid amount: \${value}\`);
        }
        return num;
    }
};
\`\`\`

### 3. 统一错误处理（P2-4）
\`\`\`javascript
// 创建 cloudfunctions/shared/errors.js
class CloudBaseError extends Error {
    constructor(code, message, data) {
        super(message);
        this.code = code;
        this.data = data;
    }
    toResponse() {
        return {
            code: this.code,
            success: false,
            message: this.message,
            data: this.data
        };
    }
}

// 创建 cloudfunctions/shared/response.js
module.exports = {
    success(data = null) {
        return { code: 0, success: true, data };
    },
    error(code, message, data) {
        return { code, success: false, message, data };
    }
};
\`\`\`

---

## 🔗 相关文档

- [CODE_REVIEW.md](./CODE_REVIEW.md) - 完整代码审查报告
- [P1_FIXES_SUMMARY.md](./docs/P1_FIXES_SUMMARY.md) - P1 问题修复总结
- [MYSQL_TO_CLOUDBASE_MAPPING.md](./MYSQL_TO_CLOUDBASE_MAPPING.md) - 字段迁移规范

---

**报告生成**: GitHub Copilot
**执行状态**: 正在执行

`;

console.log(report);

// 保存报告
const docPath = path.join(__dirname, '..', 'docs', 'FIX_PLAN.md');
const docDir = path.dirname(docPath);
if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });
fs.writeFileSync(docPath, report, 'utf8');

console.log(`\n📄 执行计划已保存至: ${docPath}`);
console.log(`\n🚀 下一步: node scripts/apply-p2-fixes.js`);
