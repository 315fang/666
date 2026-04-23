const OUTFLOW_TYPES = [
    'deduct',
    'manual_deduct',
    'n_allocate_out',
    'adjust',
    'refund_reopen_reversal',
    'order_ship',
    'spend',
    'station_procurement',
    'pickup_principal_reversal',
    'directed_b1_freeze'
];

const INFLOW_TYPES = [
    'recharge',
    'manual_recharge',
    'refund',
    'n_allocate_in',
    'commission_transfer',
    'wx_recharge',
    'pickup_principal_return',
    'directed_b1_unfreeze',
    'directed_b1_allocate_in'
];

const CHANGE_COPY = {
    recharge: { label: '货款充值到账', detail: '微信充值已进入货款余额', refLabel: '充值单号' },
    recharge_pending: { label: '货款充值处理中', detail: '充值支付处理中，到账后会更新余额', refLabel: '充值单号' },
    wx_recharge: { label: '微信充值到账', detail: '微信支付充值已进入货款余额', refLabel: '充值单号' },
    manual_recharge: { label: '后台补充货款', detail: '后台为账户增加货款余额', refLabel: '关联单号' },
    manual_deduct: { label: '后台扣减货款', detail: '后台从账户扣减货款余额', refLabel: '关联单号' },
    admin_adjustment: { label: '后台调整货款', detail: '后台调整了货款余额', refLabel: '关联单号' },
    adjust: { label: '货款余额调整', detail: '货款余额发生人工调整', refLabel: '关联单号' },
    spend: { label: '订单货款支付', detail: '使用货款余额支付订单', refLabel: '订单号' },
    deduct: { label: '订单货款支付', detail: '使用货款余额支付订单', refLabel: '订单号' },
    order_ship: { label: '订单货款支付', detail: '订单发货后扣减货款余额', refLabel: '订单号' },
    refund: { label: '订单退款返还', detail: '订单退款已退回货款余额', refLabel: '订单号' },
    refund_reopen_reversal: { label: '退款重开扣回', detail: '退款被重开或撤回，已从货款余额扣回', refLabel: '订单号' },
    station_procurement: { label: '门店备货扣款', detail: '门店采购备货扣减货款余额', refLabel: '采购单号' },
    pickup_principal_return: { label: '进货价补偿到账', detail: '自提订单进货价补偿已返还', refLabel: '订单号' },
    pickup_principal_reversal: { label: '进货价补偿扣回', detail: '进货价补偿被撤回，已扣回货款余额', refLabel: '订单号' },
    commission_transfer: { label: '佣金转入货款', detail: '可提现佣金已转入货款余额', refLabel: '关联单号' },
    n_allocate_in: { label: '货款划拨转入', detail: '上级或系统划拨货款转入账户', refLabel: '划拨单号' },
    n_allocate_out: { label: '货款划拨转出', detail: '货款余额划拨给下级或其他账户', refLabel: '划拨单号' },
    n_separation_bonus: { label: '脱离奖励到账', detail: '团队脱离奖励已进入货款余额', refLabel: '关联单号' },
    directed_b1_freeze: { label: '定向邀约冻结', detail: '发起定向邀约时冻结货款余额', refLabel: '邀约单号' },
    directed_b1_unfreeze: { label: '定向邀约解冻', detail: '定向邀约货款已解冻回可用余额', refLabel: '邀约单号' },
    directed_b1_allocate_in: { label: '定向邀约货款到账', detail: '定向邀约通过后货款已转入账户', refLabel: '邀约单号' }
};

function normalizeType(type) {
    return String(type || '').trim().toLowerCase();
}

function toAmount(value) {
    const amount = parseFloat(value);
    return isNaN(amount) ? 0 : amount;
}

function pickString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function firstFilled() {
    for (let i = 0; i < arguments.length; i += 1) {
        const value = arguments[i];
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return '';
}

function getTimeValue(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object') {
        const raw = value.$date || value.date || value.value || value._seconds;
        if (typeof raw === 'number' && value._seconds) return raw * 1000;
        return getTimeValue(raw);
    }
    const time = new Date(value).getTime();
    return isNaN(time) ? 0 : time;
}

function stringifyTime(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const time = getTimeValue(value);
    if (!time) return String(value || '');
    return new Date(time).toISOString();
}

function extractRefFromRemark(remark) {
    const text = pickString(remark);
    if (!text) return '';
    const match = text.match(/(ORD[0-9A-Za-z_-]+|[0-9]{10,})/);
    return match ? match[1] : '';
}

function getPrimaryRef(item = {}) {
    return pickString(item.order_no || item.orderNo)
        || pickString(item.ref_id)
        || pickString(item.order_id)
        || pickString(item.recharge_order_id)
        || extractRefFromRemark(item.remark);
}

function normalizeRef(value) {
    return pickString(value).toLowerCase().replace(/\s+/g, '');
}

function isStrongRef(value) {
    const ref = pickString(value);
    return /^ord/i.test(ref) || ref.length >= 16;
}

function getSource(item = {}) {
    return normalizeType(item.source_collection || item.source || '');
}

function getEventKind(item = {}) {
    const type = normalizeType(item.change_type || item.type);
    const refType = normalizeType(item.ref_type);
    const remark = pickString(item.remark);

    if (type === 'refund_reopen_reversal' || type === 'pickup_principal_reversal') return 'refund_reversal';
    if (type === 'refund' || refType.indexOf('refund') >= 0 || refType.indexOf('rollback') >= 0 || remark.indexOf('退款') >= 0) {
        return 'order_refund';
    }
    if (type === 'spend' || type === 'deduct' || type === 'order_ship' || refType.indexOf('order_payment') >= 0 || remark.indexOf('货款支付') >= 0) {
        return 'order_payment';
    }
    return '';
}

function isMergeCompatible(left = {}, right = {}) {
    const leftKind = getEventKind(left);
    const rightKind = getEventKind(right);
    if (!leftKind || leftKind !== rightKind) return false;

    const leftSource = getSource(left);
    const rightSource = getSource(right);
    if (leftSource && rightSource && leftSource === rightSource) return false;

    const leftAmount = Math.abs(toAmount(left.amount)).toFixed(2);
    const rightAmount = Math.abs(toAmount(right.amount)).toFixed(2);
    if (leftAmount !== rightAmount) return false;

    const leftRef = getPrimaryRef(left);
    const rightRef = getPrimaryRef(right);
    if (leftRef && rightRef && normalizeRef(leftRef) !== normalizeRef(rightRef) && isStrongRef(leftRef) && isStrongRef(rightRef)) {
        return false;
    }

    const leftTime = getTimeValue(left.created_at);
    const rightTime = getTimeValue(right.created_at);
    if (!leftTime || !rightTime) return true;
    return Math.abs(leftTime - rightTime) <= 30 * 1000;
}

function preferBusinessRecord(left = {}, right = {}) {
    const leftSource = getSource(left);
    const rightSource = getSource(right);
    if (leftSource === 'goods_fund_logs' && rightSource !== 'goods_fund_logs') return left;
    if (rightSource === 'goods_fund_logs' && leftSource !== 'goods_fund_logs') return right;
    if (pickString(left.order_no) && !pickString(right.order_no)) return left;
    if (pickString(right.order_no) && !pickString(left.order_no)) return right;
    return left;
}

function chooseMergedType(left = {}, right = {}) {
    const kind = getEventKind(left) || getEventKind(right);
    if (kind === 'order_payment') return 'spend';
    if (kind === 'order_refund') return 'refund';
    const leftType = normalizeType(left.change_type || left.type);
    const rightType = normalizeType(right.change_type || right.type);
    return leftType || rightType;
}

function mergeLogRecord(left = {}, right = {}) {
    const primary = preferBusinessRecord(left, right);
    const secondary = primary === left ? right : left;
    const mergedType = chooseMergedType(left, right);

    return {
        ...secondary,
        ...primary,
        type: mergedType,
        change_type: mergedType,
        order_no: firstFilled(primary.order_no, secondary.order_no, extractRefFromRemark(primary.remark), extractRefFromRemark(secondary.remark)),
        order_id: firstFilled(primary.order_id, secondary.order_id),
        ref_id: firstFilled(primary.ref_id, secondary.ref_id),
        balance_before: firstFilled(left.balance_before, right.balance_before),
        balance_after: firstFilled(left.balance_after, right.balance_after),
        source_collection: firstFilled(primary.source_collection, secondary.source_collection),
        merged_sources: [getSource(left), getSource(right)].filter(Boolean).join(',')
    };
}

function mergeWalletLogPairs(list = []) {
    const merged = [];
    (Array.isArray(list) ? list : []).forEach((item) => {
        const index = merged.findIndex((existing) => isMergeCompatible(existing, item));
        if (index >= 0) {
            merged[index] = mergeLogRecord(merged[index], item);
            return;
        }
        merged.push(item);
    });
    return merged;
}

function getChangeCopy(type, item = {}, isOut = false) {
    const normalized = normalizeType(type);
    const eventKind = getEventKind(item);
    if (eventKind === 'order_payment') return CHANGE_COPY.spend;
    if (eventKind === 'order_refund') return CHANGE_COPY.refund;
    if (normalized === 'adjust') {
        return isOut
            ? { label: '货款余额调减', detail: '后台调减了货款余额', refLabel: '关联单号' }
            : { label: '货款余额调增', detail: '后台调增了货款余额', refLabel: '关联单号' };
    }
    return CHANGE_COPY[normalized] || { label: '货款余额变动', detail: pickString(item.remark) || '货款余额发生变动', refLabel: '关联单号' };
}

function getDisplayRef(item = {}, copy = {}) {
    const orderNo = pickString(item.order_no || item.orderNo);
    if (orderNo) return { label: '订单号', value: orderNo };

    const refType = normalizeType(item.ref_type);
    const refId = pickString(item.ref_id) || pickString(item.order_id) || pickString(item.recharge_order_id) || extractRefFromRemark(item.remark);
    if (!refId) return { label: '', value: '' };

    if (refType.indexOf('order') >= 0 || getEventKind(item).indexOf('order_') === 0) {
        return { label: copy.refLabel || '订单号', value: refId };
    }
    if (refType.indexOf('recharge') >= 0 || normalizeType(item.change_type || item.type).indexOf('recharge') >= 0) {
        return { label: '充值单号', value: refId };
    }
    return { label: copy.refLabel || '关联单号', value: refId };
}

function buildDetailText(item = {}, copy = {}) {
    const detail = pickString(copy.detail);
    const remark = pickString(item.remark);
    if (!remark) return detail;
    if (remark === detail || remark === copy.label) return detail;
    if (getEventKind(item)) return detail;
    return remark;
}

function formatLogItem(page, item) {
    const changeType = normalizeType(item.change_type || item.type);
    const amountVal = toAmount(item.amount);
    const isPending = changeType === 'recharge_pending';
    const isOut = OUTFLOW_TYPES.includes(changeType) || (!isPending && amountVal < 0);
    const isIn = INFLOW_TYPES.includes(changeType) || amountVal > 0;
    const copy = getChangeCopy(changeType, item, isOut);
    const ref = getDisplayRef(item, copy);

    let statusText = '';
    let statusClass = '';
    if (isPending) {
        statusText = '处理中';
        statusClass = 'status-pending';
    } else if (item.status === 'failed') {
        statusText = '失败';
        statusClass = 'status-failed';
    }

    const timeRaw = stringifyTime(item.created_at);
    let timeText = timeRaw.replace('T', ' ').slice(5, 16);
    if (!timeText || timeText.indexOf('-') < 0) {
        timeText = timeRaw.replace('T', ' ').slice(0, 16);
    }
    const dateKey = timeRaw.slice(0, 10);

    const hasBalanceBefore = item.balance_before !== undefined && item.balance_before !== null && item.balance_before !== '';
    const hasBalanceAfter = item.balance_after !== undefined && item.balance_after !== null && item.balance_after !== '';
    const balanceBefore = hasBalanceBefore ? toAmount(item.balance_before) : null;
    const balanceAfter = hasBalanceAfter ? toAmount(item.balance_after) : null;

    return {
        ...item,
        changeLabel: copy.label,
        detailText: buildDetailText(item, copy),
        amountSign: isOut ? '-' : '+',
        isOut: !!isOut,
        isIn: !!isIn,
        amount: Math.abs(amountVal).toFixed(2),
        timeText,
        dateKey,
        balanceBefore: balanceBefore != null ? balanceBefore.toFixed(2) : '',
        balanceAfter: balanceAfter != null ? balanceAfter.toFixed(2) : '',
        hasBalanceSnapshot: balanceAfter != null,
        remark: item.remark || '',
        refLabel: ref.label,
        refIdDisplay: ref.value,
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
    const normalized = normalizeType(type);
    return (CHANGE_COPY[normalized] && CHANGE_COPY[normalized].label) || '货款余额变动';
}

module.exports = {
    formatLogItem,
    mergeWalletLogPairs,
    groupLogsByDate,
    formatGroupDate,
    getChangeLabel
};
