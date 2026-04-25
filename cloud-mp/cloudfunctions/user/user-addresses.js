'use strict';
const cloud = require('wx-server-sdk');
const db = cloud.database();
const { getAllRecords } = require('./shared/utils');

/**
 * 获取用户地址列表
 */
async function listAddresses(openid) {
    return getAllRecords(db, 'addresses', { openid });
}

function isDefaultFlag(value) {
    return value === true || value === 1 || value === '1';
}

function buildAddressIdCandidates(addressId) {
    const raw = String(addressId || '').trim();
    if (!raw) return [];
    const candidates = [raw];
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) candidates.push(numeric);
    return candidates;
}

function addressBelongsToOpenid(address = {}, openid) {
    return [address.openid, address._openid, address.user_openid]
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String)
        .includes(String(openid));
}

/**
 * 添加地址
 */
async function addAddress(openid, addressData) {
    const shouldSetDefault = isDefaultFlag(addressData.is_default);
    const result = await db.collection('addresses').add({
        data: {
            openid,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            ...addressData,
            is_default: false
        }
    });
    const createdId = result && (result._id || result.id);
    if (shouldSetDefault && createdId) {
        await setDefaultAddress(openid, createdId);
    }
    return result;
}

async function getOwnedAddress(openid, addressId) {
    const rawId = String(addressId || '').trim();
    if (rawId) {
        const res = await db.collection('addresses').doc(rawId).get().catch(() => ({ data: null }));
        const address = res && res.data;
        if (address && addressBelongsToOpenid(address, openid)) {
            return { ...address, _id: address._id || rawId };
        }
    }

    const candidates = buildAddressIdCandidates(addressId);
    const fields = ['id', '_legacy_id', 'address_id'];
    for (const field of fields) {
        for (const candidate of candidates) {
            const res = await db.collection('addresses')
                .where({ openid, [field]: candidate })
                .limit(1)
                .get()
                .catch(() => ({ data: [] }));
            const address = res.data && res.data[0];
            if (address && addressBelongsToOpenid(address, openid)) {
                return address;
            }
        }
    }

    const err = new Error('地址不存在');
    err.code = 'NOT_FOUND';
    throw err;
}

/**
 * 更新地址
 */
async function updateAddress(openid, addressId, addressData) {
    const ownedAddress = await getOwnedAddress(openid, addressId);
    const docId = String(ownedAddress._id || addressId);
    const shouldSetDefault = isDefaultFlag(addressData.is_default);
    await db.collection('addresses').doc(docId).update({
        data: {
            updated_at: db.serverDate(),
            ...addressData,
            is_default: shouldSetDefault
        }
    });
    if (shouldSetDefault) {
        await setDefaultAddress(openid, docId);
    }
    return db.collection('addresses').doc(docId).get();
}

/**
 * 删除地址
 */
async function deleteAddress(openid, addressId) {
    const ownedAddress = await getOwnedAddress(openid, addressId);
    await db.collection('addresses').doc(String(ownedAddress._id || addressId)).remove();
    return { success: true };
}

/**
 * 设置默认地址
 */
async function setDefaultAddress(openid, addressId) {
    const ownedAddress = await getOwnedAddress(openid, addressId);
    const docId = String(ownedAddress._id || addressId);
    // 先取消当前默认
    await db.collection('addresses')
        .where({ openid, is_default: true })
        .update({ data: { is_default: false } });
    // 设置新默认
    await db.collection('addresses').doc(docId).update({
        data: { is_default: true, updated_at: db.serverDate() }
    });
    return { success: true };
}

module.exports = {
    listAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
};
