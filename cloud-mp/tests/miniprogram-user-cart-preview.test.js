'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.getApp = () => ({
    globalData: {
        isLoggedIn: true,
        userInfo: {}
    }
});

const {
    buildCartPreview,
    createEmptyCartPreview
} = require('../miniprogram/pages/user/userDashboard');

test('buildCartPreview summarizes real cart items for account page', async () => {
    const preview = await buildCartPreview({
        data: {
            list: [
                {
                    _id: 'cart-a',
                    quantity: 2,
                    price: 129,
                    snapshot_name: '燕窝精萃露',
                    snapshot_spec: '默认规格',
                    snapshot_image: '/assets/images/placeholder.svg'
                },
                {
                    id: 'cart-b',
                    qty: 1,
                    effective_price: 399,
                    product: {
                        name: '镜像案例库套装',
                        images: ['/assets/images/placeholder.svg']
                    }
                }
            ]
        }
    }, true);

    assert.equal(preview.count, 3);
    assert.equal(preview.total, '657.00');
    assert.equal(preview.cartIds, 'cart-a,cart-b');
    assert.equal(preview.hasItems, true);
    assert.equal(preview.primaryName, '燕窝精萃露');
    assert.equal(preview.items.length, 2);
});

test('createEmptyCartPreview uses logged-in and logged-out copy', () => {
    assert.equal(createEmptyCartPreview(true).actionText, '去挑选');
    assert.equal(createEmptyCartPreview(false).actionText, '去登录');
});
