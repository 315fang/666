function formatMoney(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function toMoneyNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function parseTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }
    if (typeof value === 'object') {
        if (typeof value._seconds === 'number') return value._seconds * 1000;
        if (typeof value.seconds === 'number') return value.seconds * 1000;
        if (value.$date !== undefined) return parseTimestamp(value.$date);
        if (typeof value.toDate === 'function') {
            const date = value.toDate();
            return date instanceof Date ? date.getTime() : 0;
        }
    }
    return 0;
}

function formatTime(value) {
    const ts = parseTimestamp(value);
    if (!ts) return '';
    const date = new Date(ts);
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const ROLE_NAMES = {
    0: 'VIP用户',
    1: '初级会员',
    2: '高级会员',
    3: '推广合伙人',
    4: '运营合伙人',
    5: '区域合伙人',
    6: '店长'
};

const STATUS_MAP = {
    locked: { text: '预计收益', class: 'status-pending', group: 'locked' },
    unlocked: { text: '已入账', class: 'status-success', group: 'unlocked' },
    reversed: { text: '已失效', class: 'status-fail', group: 'invalid' },
    clawed_back: { text: '已扣回', class: 'status-fail', group: 'invalid' }
};

const SOURCE_TYPE_MAP = {
    team_direct: '直推订单',
    team_indirect: '团队订单',
    self_purchase: '自购订单'
};

const RULE_DETAILS = [
    { no: '1.', text: '升级奖励先进入我的存款，未达对应等级前显示为预计收益。' },
    { no: '2.', text: '当前代理等级达到奖励对应等级后，该笔存款自动进入可提取范围。' },
    { no: '3.', text: '点击佣金提取会一次性提交当前全部可提取存款，生成转佣金申请。' },
    { no: '4.', text: '转佣金申请需后台审核，审核通过后转入佣金余额；审核中不能重复提交。' },
    { no: '5.', text: '关联订单退款、取消或奖励追回时，对应存款会显示为已失效或已扣回。' }
];

function normalizePiggyBank(piggyBank = {}) {
    const lockedAmount = toMoneyNumber(piggyBank.locked_amount);
    const unlockedAmount = toMoneyNumber(piggyBank.unlocked_amount);
    const availableAmount = piggyBank.available_amount == null
        ? unlockedAmount
        : toMoneyNumber(piggyBank.available_amount);
    const totalAmount = piggyBank.total_amount == null
        ? toMoneyNumber(lockedAmount + availableAmount)
        : toMoneyNumber(piggyBank.total_amount);
    return {
        ...piggyBank,
        total_amount: totalAmount,
        available_amount: availableAmount,
        total_amount_text: formatMoney(totalAmount),
        available_amount_text: formatMoney(availableAmount),
        locked_amount_text: formatMoney(piggyBank.locked_amount),
        unlocked_amount_text: formatMoney(piggyBank.unlocked_amount),
        unlockable_amount_text: formatMoney(piggyBank.unlockable_amount),
        reversed_amount_text: formatMoney(piggyBank.reversed_amount),
        next_level_unlock_amount_text: formatMoney(piggyBank.next_level_unlock_amount)
    };
}

function roleName(level) {
    const n = Number(level);
    return ROLE_NAMES[n] || (Number.isFinite(n) && n > 0 ? `等级${n}` : '');
}

function normalizeLog(row = {}, index = 0) {
    const status = String(row.status || 'locked').trim().toLowerCase();
    const statusConfig = STATUS_MAP[status] || { text: status || '未知', class: 'status-gray', group: status || 'other' };
    const targetName = roleName(row.target_role_level);
    const currentName = roleName(row.current_role_level);
    const sourceName = SOURCE_TYPE_MAP[row.source_type] || '升级奖励';
    const levelText = currentName && targetName ? `${currentName} → ${targetName}` : targetName;
    const orderNo = row.order_no || row.order_id || '';

    return {
        ...row,
        id: row._id || row.id || `${orderNo || 'piggy'}-${row.target_role_level || 0}-${index}`,
        title: targetName ? `升至${targetName}奖励` : '升级奖励',
        amount: formatMoney(row.incremental_amount),
        created_at_text: formatTime(row.created_at || row.updated_at),
        sourceText: levelText ? `${sourceName} · ${levelText}` : sourceName,
        orderNoDisplay: orderNo,
        statusText: statusConfig.text,
        statusClass: statusConfig.class,
        statusGroup: statusConfig.group
    };
}

function filterLogs(logs = [], status = 'all') {
    if (status === 'all') return logs;
    return logs.filter((item) => item.statusGroup === status);
}

function buildTabs(logs = []) {
    const count = (status) => filterLogs(logs, status).length;
    return [
        { status: 'all', label: '全部', count: logs.length },
        { status: 'locked', label: '预计收益', count: count('locked') },
        { status: 'unlocked', label: '已入账', count: count('unlocked') },
        { status: 'invalid', label: '已失效', count: count('invalid') }
    ];
}

function buildSummary(progress = {}, logsSummary = {}, pendingCommissionApplication = null) {
    const piggyBank = normalizePiggyBank(progress.piggy_bank || logsSummary || {});
    const nextUnlock = Number(piggyBank.next_level_unlock_amount || 0);
    const nextName = progress.next_name || '';
    const hasProgress = Object.keys(progress || {}).length > 0;
    const totalAmount = toMoneyNumber(piggyBank.total_amount);
    const unlockedAmount = toMoneyNumber(piggyBank.unlocked_amount);
    const claimableAmount = toMoneyNumber(piggyBank.unlockable_amount);
    const lockedAmount = toMoneyNumber(piggyBank.locked_amount);
    const progressPercent = totalAmount > 0
        ? Math.max(8, Math.min(100, Math.round((unlockedAmount / totalAmount) * 100)))
        : 0;
    const pendingAmount = toMoneyNumber(pendingCommissionApplication && pendingCommissionApplication.amount);
    let vaultHint = '完成升级任务后，奖励会先进存钱罐。';
    if (pendingCommissionApplication) {
        vaultHint = pendingAmount > 0
            ? `¥${formatMoney(pendingAmount)} 转佣金申请审核中。`
            : '转佣金申请审核中，请等待后台处理。';
    } else if (claimableAmount > 0) {
        vaultHint = '有奖励可提取转佣金，审核通过后入账。';
    } else if (lockedAmount > 0) {
        vaultHint = nextName ? `继续升级，下一档可解锁 ¥${formatMoney(nextUnlock)}` : '继续积累，达标后可提取转佣金。';
    } else if (unlockedAmount > 0) {
        vaultHint = '奖励已入账，可在钱包继续处理。';
    }
    return {
        ...piggyBank,
        claimable_amount: claimableAmount,
        claimable_amount_text: formatMoney(claimableAmount),
        commission_pending: !!pendingCommissionApplication,
        pending_commission_amount: pendingAmount,
        pending_commission_amount_text: formatMoney(pendingAmount),
        progress_percent: progressPercent,
        vault_hint_text: vaultHint,
        claim_button_text: pendingCommissionApplication ? '转佣金审核中' : '佣金提取',
        claim_disabled: !!pendingCommissionApplication,
        next_unlock_text: nextName
            ? `升至${nextName}预计解锁 ¥${formatMoney(nextUnlock)}`
            : (hasProgress && progress.next_level == null ? '已达当前最高等级' : '升级奖励会在达成等级后自动入账')
    };
}

Page({
    data: {
        loading: true,
        currentStatus: 'all',
        filteredLogs: [],
        logs: [],
        statusTabs: buildTabs([]),
        summary: buildSummary(),
        depositGuideExpanded: false,
        depositRuleDetails: RULE_DETAILS,
        depositSubmitting: false
    },

    onShow() {
        this._load();
    },

    onPullDownRefresh() {
        this._load().finally(() => wx.stopPullDownRefresh());
    },

    async _load() {
        this.setData({ loading: true });
        try {
            const { callFn } = require('../../utils/cloud');
            const [progress, logsData, applicationData] = await Promise.all([
                callFn('distribution', { action: 'promotionProgress' }, { showError: false, readOnly: true }).catch(() => null),
                callFn('distribution', { action: 'upgradePiggyBankLogs', limit: 100 }, { showError: false, readOnly: true }).catch(() => ({ list: [], summary: {} })),
                callFn('distribution', { action: 'depositApplications', limit: 20 }, { showError: false, readOnly: true }).catch(() => ({ list: [] }))
            ]);
            const logs = ((logsData && logsData.list) || [])
                .map(normalizeLog)
                .sort((a, b) => parseTimestamp(b.created_at || b.updated_at) - parseTimestamp(a.created_at || a.updated_at));
            const pendingCommissionApplication = ((applicationData && applicationData.list) || []).find((item) => (
                item.application_type === 'deposit_commission'
                && ['pending', 'approved', 'processing'].includes(String(item.status || ''))
            )) || null;
            const statusTabs = buildTabs(logs);
            const currentStatus = this.data.currentStatus || 'all';
            this.setData({
                summary: buildSummary(progress || {}, logsData && logsData.summary ? logsData.summary : {}, pendingCommissionApplication),
                logs,
                filteredLogs: filterLogs(logs, currentStatus),
                statusTabs,
                loading: false
            });
        } catch (err) {
            console.error('[PromotionProgress] load error:', err);
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    onStatusChange(e) {
        const status = e.currentTarget.dataset.status || 'all';
        if (status === this.data.currentStatus) return;
        this.setData({
            currentStatus: status,
            filteredLogs: filterLogs(this.data.logs, status)
        });
    },

    onToggleDepositGuide() {
        this.setData({
            depositGuideExpanded: !this.data.depositGuideExpanded
        });
    },

    async onClaimToCommission() {
        if (this.data.depositSubmitting) return;
        if (this.data.summary && this.data.summary.commission_pending) {
            wx.showToast({ title: '转佣金申请审核中', icon: 'none' });
            return;
        }
        const claimableAmount = toMoneyNumber(this.data.summary && this.data.summary.claimable_amount);
        if (claimableAmount <= 0) {
            wx.showToast({ title: '暂无可提取转佣金存款', icon: 'none' });
            return;
        }
        const { post } = require('../../utils/request');
        this.setData({ depositSubmitting: true });
        wx.showLoading({ title: '提交中...' });
        try {
            const res = await post('/deposit/claim', {}, { showError: false });
            wx.hideLoading();
            if (res && res.code === 0) {
                const payload = res.data || res;
                const amount = toMoneyNumber(payload.amount);
                await this._load();
                wx.showModal({
                    title: payload.pending ? '已提交审核' : '申请已处理',
                    content: amount > 0
                        ? `¥${formatMoney(amount)} 转佣金申请已提交，审核通过后会入账佣金。`
                        : '当前没有可提取转佣金的存款，升级后可解锁更多奖励。',
                    showCancel: false
                });
            } else {
                wx.showToast({ title: res.message || '入账失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '入账失败，请重试', icon: 'none' });
        } finally {
            this.setData({ depositSubmitting: false });
        }
    }
});
