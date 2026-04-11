const uploadController = require('../../routes/admin/controllers/adminUploadController');

function createRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

describe('adminUploadController contract', () => {
    test('upload returns standard 400 error when file is missing', async () => {
        const req = {
            body: {},
            headers: {},
            get: () => 'localhost:3001',
            protocol: 'http'
        };
        const res = createRes();

        await uploadController.upload(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
            code: 400,
            message: '请选择要上传的文件'
        });
    });

    test('getUploadSignature returns server-mode payload for local provider', async () => {
        const prevProvider = uploadController.storageConfig.provider;
        uploadController.storageConfig.provider = 'local';

        const req = {
            query: { folder: 'materials' },
            headers: {},
            get: () => 'localhost:3001',
            protocol: 'http'
        };
        const res = createRes();

        await uploadController.getUploadSignature(req, res);

        uploadController.storageConfig.provider = prevProvider;

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            code: 0,
            data: {
                mode: 'server',
                provider: 'local',
                upload_url: '/admin/api/upload',
                uploadUrl: '/admin/api/upload'
            }
        });
    });
});
