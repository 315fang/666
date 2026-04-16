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

/**
 * 添加地址
 */
async function addAddress(openid, addressData) {
    const result = await db.collection('addresses').add({
        data: {
            openid,
            created_at: db.serverDate(),
            updated_at: db.serverDate(),
            ...addressData
        }
    });
    return result;
}

/**
 * 更新地址
 */
async function updateAddress(addressId, addressData) {
    await db.collection('addresses').doc(addressId).update({
        data: {
            updated_at: db.serverDate(),
            ...addressData
        }
    });
    return db.collection('addresses').doc(addressId).get();
}

/**
 * 删除地址
 */
async function deleteAddress(addressId) {
    await db.collection('addresses').doc(addressId).remove();
    return { success: true };
}

/**
 * 设置默认地址
 */
async function setDefaultAddress(openid, addressId) {
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
