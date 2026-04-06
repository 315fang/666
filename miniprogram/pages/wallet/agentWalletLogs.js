function formatLogItem(page, item) {
    const changeType = item.change_type || '';
    const isOut = ['deduct', 'manual_deduct', 'n_allocate_out', 'adjust'].includes(changeType);
    const isIn = ['recharge', 'manual_recharge', 'refund', 'n_allocate_in'].includes(changeType);
    const isPending = changeType === 'recharge_pending';

    let statusText = '';
    let statusClass = '';
    if (isPending) {
        statusText = '处理中';
        statusClass = 'status-pending';
    } else if (item.status === 'failed') {
        statusText = '失败';
        statusClass = 'status-failed';
    }

    let refIdDisplay = '';
    const refId = item.ref_id || '';
    if (refId && refId.length > 4) {
        refIdDisplay = refId.length > 16 ? refId.slice(-12) : refId;
    }

    const timeRaw = item.created_at || '';
    let timeText = timeRaw.replace('T', ' ').slice(5, 16);
    if (!timeText || timeText.indexOf('-') < 0) {
        timeText = timeRaw.replace('T', ' ').slice(0, 16);
    }
    const dateKey = timeRaw.slice(0, 10);

    const amountVal = parseFloat(item.amount) || 0;
    const balanceBefore = parseFloat(item.balance_before) || 0;
    const balanceAfter = parseFloat(item.balance_after) || 0;

    return {
        ...item,
        changeLabel: getChangeLabel(changeType),
        amountSign: isOut ? '-' : '+',
        isOut: !!isOut,
        isIn: !!isIn,
        amount: amountVal.toFixed(2),
        timeText,
        dateKey,
        balanceBefore: balanceBefore.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        remark: item.remark || '',
        refIdDisplay,
        statusText,
        statusClass
    };
}

function groupLogsByDate(logs) {
    const groups = {};
    for (const log of logs) {
        const key = log.dateKey || 'unknown';
        if (!groups[key]) {
            groups[key] = { dateKey: key, items: [] };
        }
        groups[key].items.push(log);
    }

    const result = Object.values(groups).map((group) => ({
        ...group,
        dateText: formatGroupDate(group.dateKey)
    }));

    result.sort((a, b) => (b.dateKey > a.dateKey ? 1 : -1));
    return result;
}

function formatGroupDate(dateKey) {
    if (!dateKey || dateKey === 'unknown') return '未知日期';

    const today = new Date();
    const date = new Date(dateKey + 'T00:00:00');

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (dateKey === todayStr) return '今天';
    if (dateKey === yesterdayStr) return '昨天';

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${month}月${day}日 ${weekDays[date.getDay()]}`;
}

function getChangeLabel(type) {
    const map = {
        recharge: '微信充值',
        recharge_pending: '充值处理中',
        deduct: '发货扣款',
        refund: '退款返还',
        adjust: '人工调整',
        manual_recharge: '手动充值',
        manual_deduct: '手动扣减',
        order_ship: '订单发货',
        wx_recharge: '微信支付充值',
        n_allocate_in: '货款划拨(入)',
        n_allocate_out: '货款划拨(出)',
        n_separation_bonus: '脱离奖励'
    };
    return map[type] || type || '变动';
}

module.exports = {
    formatLogItem,
    groupLogsByDate,
    formatGroupDate,
    getChangeLabel
};
