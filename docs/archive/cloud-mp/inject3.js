const fs = require('fs');
const inject = (file, code) => {
    let content = fs.readFileSync(file, 'utf8');
    const targetStr = "return { code: 400, success: false, message: '未知 action: ' + action };";
    content = content.replace(targetStr, code + '\n    ' + targetStr);
    fs.writeFileSync(file, content);
};

inject('c:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/user/index.js', `
    if (action === 'pointsSignInStatus') return { code: 0, success: true, data: { status: false, consecutive: 0, points_today: 0 } };
    if (action === 'pointsTasks') return { code: 0, success: true, data: { tasks: [] } };
    if (action === 'pointsLogs') return { code: 0, success: true, data: { list: [], pagination: { total: 0 } } };
    if (action === 'walletInfo') return { code: 0, success: true, data: { commission: 0, points: 0, balance: 0 } };
    if (action === 'walletCommissions') return { code: 0, success: true, data: { list: [], pagination: { total: 0 } } };
`);

inject('c:/Users/21963/WeChatProjects/zz/cloud-mp/cloudfunctions/distribution/index.js', `
    if (action === 'agentWallet') return { code: 0, success: true, data: { balance: 0, freeze_balance: 0, total_income: 0 } };
    if (action === 'agentWalletLogs') return { code: 0, success: true, data: { list: [], total: 0 } };
    if (action === 'agentWalletRechargeConfig') return { code: 0, success: true, data: { list: [], enabled: true } };
`);

console.log('Mock inject3 success!');
