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
    const res = await db.collection('addresses').doc(addressId).get();
    const address = res && res.data;
    if (!address || address.openid !== openid) {
        const err = new Error('地址不存在');
        err.code = 'NOT_FOUND';
        throw err;
    }
    return address;
}

/**
 * 更新地址
 */
async function updateAddress(openid, addressId, addressData) {
    await getOwnedAddress(openid, addressId);
    const shouldSetDefault = isDefaultFlag(addressData.is_default);
    await db.collection('addresses').doc(addressId).update({
        data: {
            updated_at: db.serverDate(),
            ...addressData,
            is_default: shouldSetDefault
        }
    });
    if (shouldSetDefault) {
        await setDefaultAddress(openid, addressId);
    }
    return db.collection('addresses').doc(addressId).get();
}

/**
 * 删除地址
 */
async function deleteAddress(openid, addressId) {
    await getOwnedAddress(openid, addressId);
    await db.collection('addresses').doc(addressId).remove();
    return { success: true };
}

/**
 * 设置默认地址
 */
async function setDefaultAddress(openid, addressId) {
    await getOwnedAddress(openid, addressId);
    // 先取消当前默认
    await db.collection('addresses')
        .where({ openid, is_default: true })
        .update({ data: { is_default: false } });
    // 设置新默认
    await db.collection('addresses').doc(addressId).update({
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
