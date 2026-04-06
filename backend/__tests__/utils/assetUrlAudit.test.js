const {
    analyzeAssetUrl,
    findTemporaryAssetUrls,
    ensureNoTemporaryAssetUrls
} = require('../../utils/assetUrlAudit');

describe('assetUrlAudit', () => {
    test('marks signed urls as temporary', () => {
        const analyzed = analyzeAssetUrl('https://cdn.example.com/a.jpg?Expires=123&Signature=abc');
        expect(analyzed.isTemporary).toBe(true);
        expect(analyzed.matchedKeys).toEqual(expect.arrayContaining(['expires', 'signature']));
        expect(analyzed.normalizedUrl).toBe('https://cdn.example.com/a.jpg');
    });

    test('ignores stable urls', () => {
        const results = findTemporaryAssetUrls([
            'https://cdn.example.com/a.jpg',
            '/uploads/materials/a.jpg'
        ]);
        expect(results).toHaveLength(0);
    });

    test('throws when temporary urls are present', () => {
        expect(() => ensureNoTemporaryAssetUrls([
            'https://cdn.example.com/a.jpg?x-cos-signature=abc'
        ], '商品主图')).toThrow(/商品主图/);
    });
});
