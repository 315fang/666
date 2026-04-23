const { get, post } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');
const { promptPortalPassword } = require('../../utils/portalPassword');

function money(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function normalizeDate(value = '') {
    if (!value) return '';
    return String(value).replace('T', ' ').slice(0, 16);
}

function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildSkuLabel(sku = {}) {
    return [
        sku.name,
        sku.spec,
        sku.spec_value
    ].map(compactText).filter(Boolean).join(' / ') || '默认规格';
}

function normalizeSkuOptions(skus = []) {
    return (Array.isArray(skus) ? skus : []).map((sku) => ({
        ...sku,
        sku_picker_name: buildSkuLabel(sku)
    }));
}

function buildStationReceiveSnapshot(station = {}) {
    const claimant = station.claimant || {};
    return {
        receive_contact_name: compactText(station.contact_name || station.manager_name || claimant.nick_name || claimant.nickname || station.name),
        receive_contact_phone: compactText(station.contact_phone || station.phone || claimant.phone),
        receive_address: compactText([
            station.province,
            station.city,
            station.district,
            station.address
        ].filter(Boolean).join(' '))
    };
}

function procurementStatusMeta(status = '') {
    const map = {
        pending_approval: { text: '待审批', className: 'tag-warn' },
        pending_receive: { text: '待入库', className: 'tag-info' },
        received: { text: '已入库', className: 'tag-ok' },
        rejected: { text: '已拒绝', className: 'tag-danger' }
    };
    return map[status] || { text: status || '未知', className: 'tag-info' };
}

Page({
    data: {
        loading: true,
        scope: null,
        workbench: null,
        products: [],
        skuOptions: [],
        procurementSubmitting: false,
        procurementForm: {
            station_id: '',
            station_name: '',
            product_id: '',
            product_name: '',
            sku_id: '',
            sku_name: '',
            sku_required: false,
            quantity: 1,
            supplier_name: '',
            operator_name: '',
            expected_arrival_date: '',
            remark: '',
            cost_price: '',
            receive_contact_name: '',
            receive_contact_phone: '',
            receive_address: ''
        }
    },

    onLoad() {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
    },

    onShow() {
        if (!requireLogin()) return;
        this.loadWorkbench();
        this.loadProducts();
    },

    async loadWorkbench() {
        this.setData({ loading: true });
        try {
            const res = await get('/stations/store-manager/workbench', {}, { showLoading: true });
            const data = res?.data || {};
            const stations = Array.isArray(data.stations) ? data.stations : [];
            const scope = {
                has_verify_access: stations.length > 0,
                stations,
                station_count: stations.length,
                requires_station_selection: stations.length > 1
            };
            const firstStation = stations[0] || null;
            const nextForm = { ...this.data.procurementForm };
            if (!nextForm.station_id && firstStation?.id) {
                const receiveSnapshot = buildStationReceiveSnapshot(firstStation);
                nextForm.station_id = String(firstStation.id);
                nextForm.station_name = firstStation.name || '';
                Object.assign(nextForm, receiveSnapshot);
            }
            this.setData({
                loading: false,
                scope,
                workbench: {
                    ...data,
                    pending_orders: (data.pending_orders || []).map((item) => ({
                        ...item,
                        pickup_verified_at_text: normalizeDate(item.pickup_verified_at),
                        service_fee_amount_text: money(item.service_fee_amount),
                        principal_return_amount_text: money(item.principal_return_amount)
                    })),
                    recent_verified_orders: (data.recent_verified_orders || []).map((item) => ({
                        ...item,
                        pickup_verified_at_text: normalizeDate(item.pickup_verified_at),
                        service_fee_amount_text: money(item.service_fee_amount),
                        principal_return_amount_text: money(item.principal_return_amount),
                        principal_reversal_amount_text: money(item.principal_reversal_amount)
                    })),
                    procurements: (data.procurements || []).map((item) => ({
                        ...item,
                        status_text: procurementStatusMeta(item.status).text,
                        status_class: procurementStatusMeta(item.status).className,
                        created_at_text: normalizeDate(item.created_at),
                        received_at_text: normalizeDate(item.received_at)
                    })),
                    summary: {
                        ...(data.summary || {}),
                        service_fee_total_text: money(data.summary?.service_fee_total),
                        principal_return_total_text: money(data.summary?.principal_return_total)
                    }
                },
                procurementForm: nextForm
            });
        } catch (e) {
            console.error('[my-station] storeManagerWorkbench error:', e);
            this.setData({
                scope: null,
                workbench: null,
                loading: false
            });
        }
    },

    async loadProducts(keyword = '') {
        try {
            const res = await get('/products', {
                keyword: keyword || undefined,
                limit: 50,
                status: 1
            }, { showError: false });
            const list = Array.isArray(res?.data?.list) ? res.data.list : (Array.isArray(res?.list) ? res.list : []);
            this.setData({ products: list });
        } catch (e) {
            console.error('[my-station] load products failed', e);
        }
    },

    async onProductChange(e) {
        const index = Number(e.detail.value || 0);
        const selected = this.data.products[index] || null;
        const productId = selected ? String(selected.id || selected._id || '') : '';
        const nextForm = {
            ...this.data.procurementForm,
            product_id: productId,
            product_name: selected?.name || '',
            sku_id: '',
            sku_name: '',
            sku_required: false
        };
        this.setData({ procurementForm: nextForm, skuOptions: [] });
        if (!productId) return;
        try {
            const res = await get(`/products/${productId}`, {}, { showError: false });
            const product = res?.data || res || {};
            const skuOptions = normalizeSkuOptions(product.skus);
            const patch = { skuOptions };
            if (skuOptions.length === 1) {
                patch.procurementForm = {
                    ...this.data.procurementForm,
                    sku_id: String(skuOptions[0].id || skuOptions[0]._id || ''),
                    sku_name: skuOptions[0].sku_picker_name,
                    sku_required: true
                };
            } else if (skuOptions.length > 1) {
                patch['procurementForm.sku_required'] = true;
            }
            this.setData({
                ...patch
            });
        } catch (e) {
            console.error('[my-station] load product detail failed', e);
        }
    },

    onFieldInput(e) {
        const field = e.currentTarget.dataset.field;
        if (!field) return;
        this.setData({
            [`procurementForm.${field}`]: e.detail.value
        });
    },

    onQuantityChange(e) {
        this.setData({
            'procurementForm.quantity': Number(e.detail.value || 1)
        });
    },

    onStationChange(e) {
        const index = Number(e.detail.value || 0);
        const selected = (this.data.scope?.stations || [])[index] || null;
        const receiveSnapshot = selected ? buildStationReceiveSnapshot(selected) : {
            receive_contact_name: '',
            receive_contact_phone: '',
            receive_address: ''
        };
        this.setData({
            'procurementForm.station_id': selected ? String(selected.id || '') : '',
            'procurementForm.station_name': selected?.name || '',
            'procurementForm.receive_contact_name': receiveSnapshot.receive_contact_name,
            'procurementForm.receive_contact_phone': receiveSnapshot.receive_contact_phone,
            'procurementForm.receive_address': receiveSnapshot.receive_address
        });
    },

    onSkuChange(e) {
        const index = Number(e.detail.value || 0);
        const selected = this.data.skuOptions[index] || null;
        this.setData({
            'procurementForm.sku_id': selected ? String(selected.id || selected._id || '') : '',
            'procurementForm.sku_name': selected ? (selected.sku_picker_name || buildSkuLabel(selected)) : ''
        });
    },

    onExpectedArrivalChange(e) {
        this.setData({
            'procurementForm.expected_arrival_date': e.detail.value
        });
    },

    async submitProcurement() {
        const form = this.data.procurementForm || {};
        if (this.data.procurementSubmitting) return;
        if (!form.station_id) {
            wx.showToast({ title: '请选择门店', icon: 'none' });
            return;
        }
        if (!form.product_id) {
            wx.showToast({ title: '请选择商品', icon: 'none' });
            return;
        }
        if (form.sku_required && !form.sku_id) {
            wx.showToast({ title: '请选择规格', icon: 'none' });
            return;
        }
        if (!(Number(form.quantity || 0) > 0)) {
            wx.showToast({ title: '请输入采购数量', icon: 'none' });
            return;
        }
        if (!String(form.supplier_name || '').trim()) {
            wx.showToast({ title: '请填写供应商', icon: 'none' });
            return;
        }
        if (!String(form.operator_name || '').trim()) {
            wx.showToast({ title: '请填写经办人', icon: 'none' });
            return;
        }

        const portalPassword = await promptPortalPassword({
            title: '采购申请验证',
            placeholderText: '请输入6位数字业务密码'
        });
        if (!portalPassword) return;

        this.setData({ procurementSubmitting: true });
        try {
            await post('/stations/store-manager/procurements', {
                ...form,
                quantity: Number(form.quantity || 1),
                cost_price: form.cost_price ? Number(form.cost_price) : undefined,
                portal_password: portalPassword
            }, { showError: false });
            wx.showToast({ title: '已提交审批', icon: 'success' });
            const firstStationId = this.data.scope?.stations?.[0]?.id || '';
            const firstStation = this.data.scope?.stations?.find((item) => String(item.id) === String(firstStationId || form.station_id || '')) || null;
            const receiveSnapshot = buildStationReceiveSnapshot(firstStation || {});
            this.setData({
                procurementForm: {
                    station_id: String(firstStationId || form.station_id || ''),
                    station_name: firstStation?.name || '',
                    product_id: '',
                    product_name: '',
                    sku_id: '',
                    sku_name: '',
                    sku_required: false,
                    quantity: 1,
                    supplier_name: '',
                    operator_name: '',
                    expected_arrival_date: '',
                    remark: '',
                    cost_price: '',
                    ...receiveSnapshot
                },
                skuOptions: []
            });
            this.loadWorkbench();
        } catch (e) {
            console.error('[my-station] create procurement failed', e);
            wx.showToast({ title: e?.message || '采购申请提交失败', icon: 'none' });
        } finally {
            this.setData({ procurementSubmitting: false });
        }
    },

    goPickupVerify() {
        wx.navigateTo({ url: '/pages/pickup/verify' });
    },

    goPendingOrders() {
        const stations = Array.isArray(this.data.scope?.stations) ? this.data.scope.stations : [];
        if (!stations.length) return;
        if (stations.length === 1) {
            wx.navigateTo({ url: `/pages/pickup/orders?station_id=${stations[0].id}` });
            return;
        }
        wx.showActionSheet({
            itemList: stations.map((item) => item.name || '未命名门店'),
            success: (res) => {
                const station = stations[res.tapIndex];
                if (!station?.id) return;
                wx.navigateTo({ url: `/pages/pickup/orders?station_id=${station.id}` });
            }
        });
    },

    goCommissionLogs() {
        wx.navigateTo({ url: '/pages/distribution/commission-logs' });
    },

    goAgentWallet() {
        wx.navigateTo({ url: '/pages/wallet/agent-wallet' });
    }
});
