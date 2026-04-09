// inject2.js — 开发阶段 mock 注入脚本
// ⚠️ 此脚本仅用于在云函数真实实现尚未完成时临时注入 mock 数据
// ⚠️ 当真实实现已就绪后，应移除对应 action 的 mock，否则 mock 会先于真实逻辑返回
// ⚠️ 目前以下 action 已有真实实现，不需要 mock：
//     - user/pointsAccount（buildPointsAccount 已实现）
//     - user/availableCoupons（真实过滤逻辑已实现）
//     - config/boardsMap, banners, activityBubbles, activityLinks, festivalConfig（均已实现）

const fs = require('fs');
const inject = (file, code) => {
    let content = fs.readFileSync(file, 'utf8');
    const targetStr = "return { code: 400, success: false, message: '未知 action: ' + action };";
    content = content.replace(targetStr, code + '\n    ' + targetStr);
    fs.writeFileSync(file, content);
};

// ── 当前所有常用 action 均已有真实实现，无需注入 mock ──
// 如需新增 mock，请按以下格式添加：
// inject('cloudfunctions/xxx/index.js', `
//     if (action === 'someAction') return { code: 0, success: true, data: {} };
// `);

console.log('Inject2: no mocks to inject (all actions have real implementations)');
