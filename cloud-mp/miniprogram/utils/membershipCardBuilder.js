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
    barPercent
}) {
    const progressText = resolveConsumeProgressText(nextTierMin, subLine);
    return {
        label: '成长会员',
        tierName: normalizeText(currentTierName, '普通会员'),
        growthValue: normalizeNumber(growthValue, 0),
        progressText,
        progressPercent: Math.max(0, Math.min(100, normalizeNumber(barPercent, 0))),
        benefitText: '成长值用于解锁会员等级与成长会员权益；并按规则升级'
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
    const hasLevels = Array.isArray(memberLevels) && memberLevels.length > 0;

    let statusText = '团队与成长会员权益以当前身份为准';
    if (!hasLevels) {
        statusText = '权益信息暂未加载完成，请稍后重试';
    } else if (isAgent) {
        statusText = '享受当前等级对应权益';
    }

    return {
        label: '代理权益',
        roleName,
        levelText: isAgent ? `Lv.${currentRoleLevel}` : '未开通',
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
                '团队与成长会员权益以当前身份为准'
            ) === '权益信息暂未加载完成，请稍后重试'
                ? '团队与成长会员权益以当前身份为准'
                : '团队与成长会员权益以当前身份为准'
        };
    }

    const consumeDesc = normalizeText(
        consumeCardSummary && consumeCardSummary.progressText,
        '成长值用于会员等级与成长会员权益升级'
    );
    return {
        title: '成长会员权益',
        desc: consumeDesc === '已达到最高等级'
            ? '成长值用于会员等级与成长会员权益升级'
            : '成长值用于会员等级与成长会员权益升级'
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
        barPercent: input.barPercent
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
