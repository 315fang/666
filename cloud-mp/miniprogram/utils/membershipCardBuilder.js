function normalizeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function normalizeRoleLevel(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function resolveActiveCard(currentRoleLevel) {
    return currentRoleLevel >= 1 ? 'agent' : 'consume';
}

function resolveSwiperIndex(activeCard) {
    return activeCard === 'agent' ? 1 : 0;
}

function resolveCurrentDiscountText(growthTiers = []) {
    const activeTier = (growthTiers || []).find((item) => item && item.active);
    return normalizeText(activeTier && activeTier.discountText, '原价');
}

function resolveConsumeProgressText(nextTierMin, subLine) {
    const nextMin = Number(nextTierMin);
    if (!Number.isFinite(nextMin) || nextMin <= 0) {
        return '已达到最高等级';
    }
    return normalizeText(subLine, '已达到最高等级');
}

function resolveAgentLevel(memberLevels = [], currentRoleLevel) {
    const normalizedLevels = Array.isArray(memberLevels) ? memberLevels : [];
    return normalizedLevels.find((item) => normalizeRoleLevel(item && item.level) === currentRoleLevel) || null;
}

function buildConsumeCardSummary({
    currentTierName,
    growthValue,
    nextTierMin,
    subLine,
    barPercent,
    growthTiers
}) {
    const discountText = resolveCurrentDiscountText(growthTiers);
    const progressText = resolveConsumeProgressText(nextTierMin, subLine);
    return {
        label: '消费会员',
        tierName: normalizeText(currentTierName, '普通会员'),
        growthValue: normalizeNumber(growthValue, 0),
        progressText,
        progressPercent: Math.max(0, Math.min(100, normalizeNumber(barPercent, 0))),
        discountText,
        benefitText: discountText === '原价'
            ? '当前复购价按原价结算'
            : `当前复购价享 ${discountText}`
    };
}

function buildAgentCardSummary({
    currentRoleName,
    currentRoleLevel,
    memberLevels
}) {
    const level = resolveAgentLevel(memberLevels, currentRoleLevel);
    const isAgent = currentRoleLevel >= 1;
    const roleName = normalizeText(
        currentRoleName,
        isAgent ? '代理权益' : '未开通代理权益'
    );
    const discountText = normalizeText(level && level.discountText, '暂无额外折扣');
    const hasLevels = Array.isArray(memberLevels) && memberLevels.length > 0;

    let statusText = '代理等级由后台审核认定';
    if (!hasLevels) {
        statusText = '代理等级信息暂未加载完成，请稍后重试';
    } else if (isAgent) {
        statusText = '享受额外折扣与团队权益';
    }

    return {
        label: '代理权益',
        roleName,
        levelText: isAgent ? `Lv.${currentRoleLevel}` : '未开通',
        discountText,
        statusText,
        isAgent,
        showEntry: isAgent
    };
}

function getMembershipCardMeta({
    activeCard,
    consumeCardSummary,
    agentCardSummary
}) {
    if (activeCard === 'agent') {
        return {
            title: '代理权益说明',
            desc: normalizeText(
                agentCardSummary && agentCardSummary.statusText,
                '代理等级独立于成长值体系，由后台审核认定'
            ) === '代理等级信息暂未加载完成，请稍后重试'
                ? '代理等级独立于成长值体系，由后台审核认定'
                : '代理等级独立于成长值体系，由后台审核认定'
        };
    }

    const consumeDesc = normalizeText(
        consumeCardSummary && consumeCardSummary.progressText,
        '成长值决定当前折扣与升级路径'
    );
    return {
        title: '消费会员权益',
        desc: consumeDesc === '已达到最高等级'
            ? '成长值决定当前折扣与升级路径'
            : '成长值决定当前折扣与升级路径'
    };
}

function buildMembershipCardViewModel(input = {}) {
    const currentRoleLevel = normalizeRoleLevel(input.currentRoleLevel);
    const activeCard = resolveActiveCard(currentRoleLevel);
    const cardSwiperCurrent = resolveSwiperIndex(activeCard);
    const consumeCardSummary = buildConsumeCardSummary({
        currentTierName: input.currentTierName,
        growthValue: input.growthValue,
        nextTierMin: input.nextTierMin,
        subLine: input.subLine,
        barPercent: input.barPercent,
        growthTiers: input.growthTiers
    });
    const agentCardSummary = buildAgentCardSummary({
        currentRoleName: input.currentRoleName,
        currentRoleLevel,
        memberLevels: input.memberLevels
    });

    return {
        activeCard,
        cardSwiperCurrent,
        consumeCardSummary,
        agentCardSummary,
        currentCardMeta: getMembershipCardMeta({
            activeCard,
            consumeCardSummary,
            agentCardSummary
        })
    };
}

module.exports = {
    buildMembershipCardViewModel,
    getMembershipCardMeta
};
