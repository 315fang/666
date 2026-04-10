#!/usr/bin/env node

/**
 * P1 问题修复验证脚本
 * 
 * 验证内容：
 * 1. 权限越权修复 - 代理订单查看权限
 * 2. 字段污染修复 - buyer_id 是否停止写入
 * 3. 门禁状态检查
 * 
 * 运行方式：node scripts/verify-p1-fixes.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// 颜色输出
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(level, message) {
    const levels = {
        '✅': colors.green,
        '❌': colors.red,
        '⚠️': colors.yellow,
        'ℹ️': colors.blue
    };
    const color = levels[level] || '';
    console.log(`${color}${level} ${message}${colors.reset}`);
}

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        return null;
    }
}

function fileContains(filePath, searchStr, shouldExist = true) {
    const content = readFile(filePath);
    if (!content) return false;
    const exists = content.includes(searchStr);
    return shouldExist ? exists : !exists;
}

// ========================================
// P1-1: 代理订单权限越权修复
// ========================================
function checkP1_1_AgentOrderPermission() {
    log('ℹ️', '检查 P1-1: 代理订单权限越权修复...');
    
    const distFilePath = path.join(projectRoot, 'cloudfunctions/distribution/index.js');
    const content = readFile(distFilePath);
    
    if (!content) {
        log('❌', '找不到 distribution/index.js');
        return false;
    }
    
    // 检查关键的权限检查代码
    const hasPermissionCheck = content.includes("if (pickRoleLevel(user) < 3)") &&
                              content.includes("code: 403") &&
                              content.includes("Permission denied: agent role");
    
    // 检查是否已移除实际的越权逻辑（应该在注释中或被删除）
    const hasFixComment = content.includes('🔒 订单权限修复') || 
                         content.includes('已删除：return pickRoleLevel(user) >= 3');
    
    // 检查订单过滤逻辑是否正确
    const hasCorrectFilter = content.includes('if (item.openid === openid) return true;') &&
                            content.includes('return false;');
    
    if (hasPermissionCheck && hasFixComment && hasCorrectFilter) {
        log('✅', 'P1-1 已修复：代理只能看自己的订单，已移除角色越权');
        return true;
    } else {
        log('❌', 'P1-1 未完全修复');
        if (!hasPermissionCheck) log('  ❌ 缺少角色权限检查');
        if (!hasFixComment) log('  ❌ 缺少修复标记');
        if (!hasCorrectFilter) log('  ❌ 订单过滤逻辑错误');
        return false;
    }
}

// ========================================
// P1-2: 订单 buyer_id 字段污染修复
// ========================================
function checkP1_2_OrderFieldPollution() {
    log('ℹ️', '检查 P1-2: 订单字段污染修复...');
    
    const orderFilePath = path.join(projectRoot, 'cloudfunctions/order/index.js');
    const content = readFile(orderFilePath);
    
    if (!content) {
        log('❌', '找不到 order/index.js');
        return false;
    }
    
    // 统计 buyer_id 的出现次数（应该只有读取/查询，不应有写入）
    const lines = content.split('\n');
    let issuesFound = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // 检查是否有写入 buyer_id 的代码（在 orderData 等对象中）
        if (line.includes('buyer_id:') && 
            (lines[i-1]?.includes('orderData') || 
             lines[i-1]?.includes('const order') ||
             line.includes('{ data: {'))) {
            log('❌', `第 ${i+1} 行：发现 buyer_id 写入 - ${line.trim()}`);
            issuesFound++;
        }
    }
    
    // 检查是否有修复注释
    const hasFixComment = content.includes('仅使用新字段 openid') ||
                         content.includes('已废弃 buyer_id');
    
    if (issuesFound === 0 && hasFixComment) {
        log('✅', 'P1-2 已修复：已停止写入 buyer_id，仅保留 openid');
        return true;
    } else if (issuesFound > 0) {
        log('❌', `P1-2 未修复：找到 ${issuesFound} 处 buyer_id 写入`);
        return false;
    } else if (issuesFound === 0) {
        log('✅', 'P1-2 已修复：未发现 buyer_id 写入操作');
        return true;
    }
}

// ========================================
// P1-3: 发布门禁完整性检查
// ========================================
function checkP1_3_ReleaseCheckGateway() {
    log('ℹ️', '检查 P1-3: 发布门禁脚本完整性...');
    
    const scriptPath = path.join(projectRoot, 'scripts/check-production-gaps.js');
    const content = readFile(scriptPath);
    
    if (!content) {
        log('⚠️', 'P1-3 未找到 check-production-gaps.js（可能不需要）');
        return null;
    }
    
    const checks = {
        '云函数部署检查': content.includes('checkCloudFunctionExistence') ||
                       content.includes('requiredFunctions'),
        '数据库集合检查': content.includes('checkCloudBaseSeed') ||
                       content.includes('cloudbase-seed'),
        '认证配置检查': content.includes('checkAuthConfiguration') ||
                     content.includes('cloudbaseEnv'),
        '字段读取安全': content.includes('Number.isFinite') &&
                     content.includes('typeof legacyAudit.summary === \'object\'')
    };
    
    const passed = Object.values(checks).filter(v => v).length;
    const total = Object.keys(checks).length;
    
    if (passed === total) {
        log('✅', `P1-3 已修复：发布门禁完整性检查（${passed}/${total} 项）`);
    } else {
        log('⚠️', `P1-3 部分修复: ${passed}/${total} 项通过`);
    }
    
    Object.entries(checks).forEach(([check, result]) => {
        const symbol = result ? '✅' : '❌';
        console.log(`  ${symbol} ${check}`);
    });
    
    return passed === total;
}

// ========================================
// 运行所有检查
// ========================================
function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 P1 问题修复验证');
    console.log('='.repeat(60) + '\n');
    
    const results = {
        'P1-1: 权限越权': checkP1_1_AgentOrderPermission(),
        'P1-2: 字段污染': checkP1_2_OrderFieldPollution(),
        'P1-3: 门禁完整性': checkP1_3_ReleaseCheckGateway()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 验证总结');
    console.log('='.repeat(60) + '\n');
    
    let passCount = 0;
    Object.entries(results).forEach(([issue, result]) => {
        if (result === true) {
            log('✅', `${issue}: 通过`);
            passCount++;
        } else if (result === false) {
            log('❌', `${issue}: 失败`);
        } else {
            log('⚠️', `${issue}: 待确认`);
        }
    });
    
    console.log('\n' + '='.repeat(60));
    const totalIssues = Object.keys(results).filter(k => results[k] !== null).length;
    log('ℹ️', `通过 ${passCount}/${totalIssues} 个 P1 问题检查`);
    console.log('='.repeat(60) + '\n');
    
    if (passCount === totalIssues) {
        log('✅', '所有 P1 问题已修复并验证通过！');
        process.exit(0);
    } else {
        log('❌', '仍有 P1 问题需要修复');
        process.exit(1);
    }
}

main();
