const fs = require('fs');
const path = require('path');

function inject(file, code) {
    const _file = path.join('c:/Users/21963/WeChatProjects/zz/cloud-mp', file);
    let content = fs.readFileSync(_file, 'utf8');
    
    // Find the catch-all return line
    const catchAllStr = "return { code: 400, success: false, message: '未知 action: ' + action };";
    
    if (!content.includes(catchAllStr)) {
        console.log("NOT FOUND in: " + file);
        return;
    }

    content = content.replace(catchAllStr, code + '\n    ' + catchAllStr);
    fs.writeFileSync(_file, content);
}

// 1. distribution
inject('cloudfunctions/distribution/index.js', `
    if (action === 'stats') {
        const uRes = await db.collection('users').where({ openid }).get();
        const u = uRes.data[0] || {};
        return { code: 0, success: true, data: { team_count: u.referee_count||0, order_count: u.order_count||0, total_sales: u.total_sales||0 } };
    }
`);

// 2. config
inject('cloudfunctions/config/index.js', `
    if (action === 'activities') {
        return { code: 0, success: true, data: [] }; // Mock
    }
    if (action === 'groups') {
        return { code: 0, success: true, data: { list: [], total: 0 } };
    }
    if (action === 'groupDetail') {
        return { code: 404, success: false, message: '拼团不存在' };
    }
    if (action === 'slashList') {
        return { code: 0, success: true, data: { list: [], total: 0 } };
    }
    if (action === 'slashDetail') {
        return { code: 404, success: false, message: '砍价不存在' };
    }
    if (action === 'lottery') {
         return { code: 0, success: true, data: { status: 0, message: '暂无活动' } };
    }
`);

// 3. order
inject('cloudfunctions/order/index.js', `
    if (action === 'refundDetail') {
        const res = await db.collection('refunds').doc(params.refund_id).get();
        return { code: 0, success: true, data: res.data };
    }
    if (action === 'trackLogistics') {
        return { code: 0, success: true, data: { traces: [], company: '顺丰', tracking_no: 'SF123456' } };
    }
    if (action === 'joinGroup' || action === 'slashHelp' || action === 'lotteryDraw') {
        return { code: 0, success: false, message: '营销活动云开发版正在升级中' };
    }
`);

// 4. user
inject('cloudfunctions/user/index.js', `
    if (action === 'getFavorites') {
        const res = await db.collection('user_favorites').where({ user_id: openid }).get();
        return { code: 0, success: true, data: { list: res.data, total: res.data.length } };
    }
    if (action === 'addFavorite') {
        await db.collection('user_favorites').add({ data: { user_id: openid, product_id: params.product_id, created_at: db.serverDate() } });
        return { code: 0, success: true };
    }
    if (action === 'removeFavorite') {
        const res = await db.collection('user_favorites').where({ user_id: openid, product_id: params.product_id }).get();
        if (res.data.length) {
            await db.collection('user_favorites').doc(res.data[0]._id).remove();
        }
        return { code: 0, success: true };
    }
    if (action === 'listNotifications') {
        const res = await db.collection('notifications').where({ user_id: openid }).orderBy('created_at','desc').get();
        return { code: 0, success: true, data: { list: res.data, total: res.data.length } };
    }
    if (action === 'markRead') {
        await db.collection('notifications').doc(params.notification_id).update({ data: { is_read: true } });
        return { code: 0, success: true };
    }
    if (action === 'listStations' || action === 'getPickupScope') {
        const res = await db.collection('stations').where({ status: 1 }).get();
        return { code: 0, success: true, data: res.data };
    }
    if (action === 'upgradeEligibility') {
        return { code: 0, success: true, data: { eligible: false, message: '条件未满足' } };
    }
    if (action === 'upgrade') {
        return { code: 400, success: false, message: '暂不可升级' };
    }
`);
console.log('注入完成');