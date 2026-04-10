const { get, post } = require('./request');

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function payloadOf(res) {
    if (!res || res.code !== 0) return {};
    return res.data && typeof res.data === 'object' ? res.data : res;
}

function normalizePointAccount(account = {}, status = {}) {
    const pointValue = account.points != null ? account.points : account.growth_value;
    const totalPoints = toNumber(account.total_points != null ? account.total_points : pointValue);
    const balancePoints = toNumber(account.balance_points != null ? account.balance_points : pointValue);
    const growthValue = toNumber(account.growth_value != null ? account.growth_value : totalPoints);
    const levelNum = toNumber(account.level, 1) || 1;
    const streakSource = status.streak != null
        ? status.streak
        : (status.consecutive_days != null ? status.consecutive_days : account.checkin_streak);
    const signedSource = status.signed != null
        ? status.signed
        : (status.signed_today != null ? status.signed_today : account.today_signed);
    const streak = toNumber(streakSource);
    const todaySigned = Boolean(signedSource);
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
        payloadOf(accountRes),
        payloadOf(statusRes)
    );

    return {
        account,
        accountRes,
        statusRes
    };
}

async function fetchPointBalance() {
    const res = await get('/points/account');
    return normalizePointAccount(payloadOf(res)).balance_points;
}

async function checkinPoints() {
    const res = await post('/points/sign-in');
    if (res?.code !== 0) return res;
    const data = payloadOf(res);

    const account = normalizePointAccount({
        total_points: data.total_points != null ? data.total_points : data.points,
        balance_points: data.balance_points != null ? data.balance_points : data.points,
        growth_value: data.growth_value,
        level: data.level,
        checkin_streak: data.streak != null ? data.streak : data.consecutive_days
    }, {
        signed: true,
        streak: data.streak != null ? data.streak : data.consecutive_days
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
