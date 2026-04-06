jest.mock('../../services/StorageService', () => ({
    deleteFileByUrl: jest.fn()
}));

jest.mock('../../models', () => ({
    Product: { findAll: jest.fn() },
    Material: { findAll: jest.fn() },
    Banner: { findAll: jest.fn() },
    Content: { findAll: jest.fn() },
    ContentBoardItem: { findAll: jest.fn() }
}));

const { deleteFileByUrl } = require('../../services/StorageService');
const { Product, Material, Banner, Content, ContentBoardItem } = require('../../models');
const {
    normalizeAssetUrl,
    collectAssetReferences,
    deleteAssetIfUnreferenced
} = require('../../services/AssetReferenceService');

describe('AssetReferenceService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Product.findAll.mockResolvedValue([]);
        Material.findAll.mockResolvedValue([]);
        Banner.findAll.mockResolvedValue([]);
        Content.findAll.mockResolvedValue([]);
        ContentBoardItem.findAll.mockResolvedValue([]);
    });

    test('normalizeAssetUrl strips query and hash', () => {
        expect(
            normalizeAssetUrl('https://cdn.example.com/products/a.jpg?Expires=1#foo')
        ).toBe('https://cdn.example.com/products/a.jpg');
    });

    test('collectAssetReferences detects shared usage across models', async () => {
        Product.findAll.mockResolvedValue([
            {
                id: 1,
                name: '共享商品',
                images: ['https://cdn.example.com/products/a.jpg'],
                detail_images: []
            }
        ]);
        Material.findAll.mockResolvedValue([
            {
                id: 2,
                title: '共享素材',
                url: 'https://cdn.example.com/products/a.jpg',
                thumbnail_url: null
            }
        ]);

        const refs = await collectAssetReferences('https://cdn.example.com/products/a.jpg?x=1');

        expect(refs).toEqual([
            { type: 'product.images', id: 1, label: '共享商品' },
            { type: 'material.url', id: 2, label: '共享素材' }
        ]);
    });

    test('deleteAssetIfUnreferenced skips physical delete when references remain', async () => {
        Product.findAll.mockResolvedValue([
            {
                id: 1,
                name: '共享商品',
                images: ['https://cdn.example.com/products/a.jpg'],
                detail_images: []
            }
        ]);

        const result = await deleteAssetIfUnreferenced('https://cdn.example.com/products/a.jpg');

        expect(result.deleted).toBe(false);
        expect(result.references).toHaveLength(1);
        expect(deleteFileByUrl).not.toHaveBeenCalled();
    });

    test('deleteAssetIfUnreferenced deletes when no references remain', async () => {
        const result = await deleteAssetIfUnreferenced('https://cdn.example.com/products/a.jpg');

        expect(result).toEqual({ deleted: true, references: [] });
        expect(deleteFileByUrl).toHaveBeenCalledWith('https://cdn.example.com/products/a.jpg');
    });
});
