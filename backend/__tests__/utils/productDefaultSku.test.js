const {
    buildDefaultSpecText,
    findDefaultSku,
    pickFallbackDefaultSku,
    resolveDefaultSpecText
} = require('../../utils/productDefaultSku');

describe('productDefaultSku utils', () => {
    test('buildDefaultSpecText returns sku spec value only', () => {
        expect(buildDefaultSpecText({ spec_name: '容量', spec_value: '120ml' })).toBe('120ml');
        expect(buildDefaultSpecText({
            specs: [
                { name: '容量', value: '120ml' },
                { name: '版本', value: '礼盒' }
            ]
        })).toBe('120ml / 礼盒');
    });

    test('findDefaultSku prefers product.default_sku_id', () => {
        const product = { default_sku_id: 3 };
        const skus = [{ id: 2 }, { id: 3 }, { id: 4 }];
        expect(findDefaultSku(product, skus)).toEqual({ id: 3 });
    });

    test('pickFallbackDefaultSku matches plan ordering', () => {
        const product = { retail_price: 120 };
        const skus = [
            { id: 4, stock: 0, retail_price: 120 },
            { id: 3, stock: 5, retail_price: 125 },
            { id: 2, stock: 5, retail_price: 118 },
            { id: 1, stock: 5, retail_price: 118 }
        ];
        expect(pickFallbackDefaultSku(product, skus)).toEqual({ id: 1, stock: 5, retail_price: 118 });
    });

    test('resolveDefaultSpecText only returns explicit default or single sku text', () => {
        expect(resolveDefaultSpecText(
            { default_sku_id: 8 },
            [{ id: 8, spec_name: '容量', spec_value: '50G' }, { id: 9, spec_name: '容量', spec_value: '120G' }]
        )).toBe('50G');
        expect(resolveDefaultSpecText(
            {},
            [{ id: 11, spec_name: '容量', spec_value: '120ml' }]
        )).toBe('120ml');
        expect(resolveDefaultSpecText(
            {},
            [{ id: 12, spec_name: '容量', spec_value: '50ml' }, { id: 13, spec_name: '容量', spec_value: '120ml' }]
        )).toBe('');
    });
});
