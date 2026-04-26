'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

global.getApp = () => ({
    globalData: {
        userInfo: { role_level: 0 }
    }
});

const {
    collectProductGallerySources,
    collectProductDetailImageSources
} = require('../miniprogram/pages/product/productDetailData');

test('product detail image sources do not let empty preview arrays hide persistent refs', () => {
    const product = {
        images: ['cloud://env/product-cover'],
        preview_images: [],
        image_ref: 'cloud://env/product-image-ref',
        detail_images: ['cloud://env/product-detail'],
        preview_detail_images: []
    };

    assert.deepEqual(collectProductGallerySources(product), [
        'cloud://env/product-cover',
        'cloud://env/product-image-ref'
    ]);
    assert.deepEqual(collectProductDetailImageSources(product), [
        'cloud://env/product-detail'
    ]);
});

test('product detail image sources keep backend previews as fallback after persistent refs', () => {
    const product = {
        images: ['cloud://env/product-cover'],
        preview_images: ['https://temp.example/product-cover.jpg'],
        image_url: 'https://temp.example/fallback.jpg',
        detail_images: ['cloud://env/product-detail'],
        preview_detail_images: ['https://temp.example/product-detail.jpg']
    };

    assert.deepEqual(collectProductGallerySources(product), [
        'cloud://env/product-cover',
        'https://temp.example/product-cover.jpg',
        'https://temp.example/fallback.jpg'
    ]);
    assert.deepEqual(collectProductDetailImageSources(product), [
        'cloud://env/product-detail',
        'https://temp.example/product-detail.jpg'
    ]);
});
