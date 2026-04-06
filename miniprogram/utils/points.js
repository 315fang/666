const { get, post } = require('./request');

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function normalizePointAccount(account = {}, status = {}) {
    const totalPoints = toNumber(account.total_points);
    const balancePoints = toNumber(account.balance_points);
    const growthValue = toNumber(account.growth_value);
    const levelNum = toNumber(account.level, 1) || 1;
    const streak = toNumber(status.streak ?? account.checkin_streak);
    const todaySigned = Boolean(status.signed ?? account.today_signed);
    const growthNeeded = toNumber(account.next_level?.growth_needed ?? account.next_level?.points_needed);
    const nextTierMin = toNumber(account.next_level?.min);
    let growthProgress = toNumber(account.growth_progress);
    if (!Number.isFinite(growthProgress) || growthProgress < 0) {
        growthProgress = 100;
    }

    return {
        ...account,
        total_points: totalPoints,
        balance_points: balancePoints,
        growth_value: growthValue,
        level: levelNum,
        streak,
        today_signed: todaySigned,
        level_name: account.level_name || `Lv${levelNum}`,
        next_level_name: account.next_level?.name || '',
        next_level_threshold: nextTierMin > 0 ? nextTierMin : 0,
        growth_progress: growthProgress,
        growth_needed: growthNeeded
    };
}

async function fetchPointSummary() {
    const [accountRes, statusRes] = await Promise.all([
        get('/points/account').catch(() => null),
        get('/points/sign-in/status').catch(() => null)
    ]);

    const account = normalizePointAccount(
        accountRes?.code === 0 ? (accountRes.data || {}) : {},
        statusRes?.code === 0 ? (statusRes.data || {}) : {}
    );

    return {
        account,
        accountRes,
        statusRes
    };
}

async function fetchPointBalance() {
    const res = await get('/points/account');
    return normalizePointAccount(res?.data || {}).balance_points;
}

async function checkinPoints() {
    const res = await post('/points/sign-in');
    if (res?.code !== 0) return res;

    const account = normalizePointAccount({
        total_points: res.data?.total_points,
        balance_points: res.data?.balance_points,
        level: res.data?.level,
        checkin_streak: res.data?.streak
    }, {
        signed: true,
        streak: res.data?.streak
    });

    return {
        ...res,
        account
    };
}

module.exports = {
    normalizePointAccount,
    fetchPointSummary,
    fetchPointBalance,
    checkinPoints
};
