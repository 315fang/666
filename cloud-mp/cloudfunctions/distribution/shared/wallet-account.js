'use strict';

function sanitizeWalletAccountId(value = '') {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildWalletAccountSyncDoc({
    walletAccount = null,
    user = {},
    openid = '',
    userId = '',
    balance = 0,
    frozenBalance = 0,
    now = new Date().toISOString()
} = {}) {
    const accountId = String(
        walletAccount?._id
        || walletAccount?.id
        || `wallet-${sanitizeWalletAccountId(userId || openid)}`
    );

    const data = {
        ...(walletAccount || {}),
        id: accountId,
        user_id: userId,
        openid: user.openid || openid || '',
        account_type: walletAccount?.account_type || 'goods_fund',
        status: walletAccount?.status || 'active',
        balance,
        frozen_balance: frozenBalance,
        updated_at: now,
        created_at: walletAccount?.created_at || now
    };

    delete data._id;

    return {
        accountId,
        data,
        view: {
            ...data,
            _id: accountId
        }
    };
}

module.exports = {
    buildWalletAccountSyncDoc,
    sanitizeWalletAccountId
};
