'use strict';

function buildWalletAccountWriteModel({
    existingAccount = null,
    accountId = '',
    userId = '',
    openid = '',
    patch = {},
    createdAt = ''
} = {}) {
    const normalizedAccountId = String(accountId || existingAccount?._id || existingAccount?.id || '').trim();
    const baseRow = existingAccount
        ? { ...existingAccount }
        : {
            _id: normalizedAccountId,
            id: normalizedAccountId,
            user_id: userId,
            openid,
            account_type: 'goods_fund',
            status: 'active',
            created_at: createdAt
        };

    const localRow = {
        ...baseRow,
        ...patch,
        _id: baseRow._id || normalizedAccountId,
        id: baseRow.id || normalizedAccountId,
        user_id: baseRow.user_id || userId,
        openid: baseRow.openid || openid,
        created_at: baseRow.created_at || createdAt
    };

    const cloudData = { ...localRow };
    delete cloudData._id;

    return {
        accountId: normalizedAccountId,
        localRow,
        cloudData
    };
}

module.exports = {
    buildWalletAccountWriteModel
};
