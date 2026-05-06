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

function getStationSubmitId(station = {}) {
    return String(station.binding_station_id || station.id || station._id || station._legacy_id || '');
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

function stockStatusMeta(status = '') {
    const map = {
        sufficient: { text: '库存充足', className: 'tag-ok' },
        tight: { text: '库存紧张', className: 'tag-warn' },
        insufficient: { text: '暂时无货', className: 'tag-danger' }
    };
    return map[status] || { text: '库存未知', className: 'tag-info' };
}

function buildInventorySkuText(item = {}) {
    return [
        item.sku_name,
        item.sku_spec
    ].map(compactText).filter(Boolean).join(' / ') || '默认规格';
}

function buildInventoryRows(rows = [], filter = 'all') {
    const source = Array.isArray(rows) ? rows : [];
    return filter === 'low' ? source.filter((item) => item.low_stock) : source;
}

function stockLogTypeMeta(type = '') {
    const map = {
        procure_in: { text: '采购入库', className: 'tag-ok' },
        reserve: { text: '订单预占', className: 'tag-warn' },
        release: { text: '释放预占', className: 'tag-info' },
        pickup_consume: { text: '核销消耗', className: 'tag-danger' },
        refund_restore: { text: '退货恢复', className: 'tag-ok' },
        manual_adjust: { text: '平台调整', className: 'tag-info' }
    };
    return map[type] || { text: '库存变动', className: 'tag-info' };
}

function signedQuantityText(value) {
    const quantity = Number(value || 0);
    if (!Number.isFinite(quantity)) return '0';
    return `${quantity > 0 ? '+' : ''}${quantity}`;
}

function buildInventoryEmptyText(inventory = [], procurements = []) {
    if (inventory.length) return '当前筛选下没有库存预警。';
    if (procurements.some((item) => item.status === 'pending_receive')) {
        return '已有采购通过审批，等待平台确认入库后会形成门店库存。';
    }
    if (procurements.some((item) => item.status === 'pending_approval')) {
        return '已有采购申请待审批，审批并确认入库后会形成门店库存。';
    }
    return '当前门店暂无库存记录，采购入库后会在这里显示。';
}

function buildWorkbenchView(data = {}, inventoryFilter = 'all') {
    const summary = data.summary || {};
    const pendingOrderCount = Number(summary.pending_order_count || 0);
    const lowStockCount = Number(summary.inventory_low_stock_count || 0);
    const procurementPendingCount = Number(summary.procurement_pending_count || 0);
    const inventory = (data.inventory || []).map((item) => ({
        ...item,
        sku_display: buildInventorySkuText(item),
        station_name: item.station_name || '未命名门店',
        product_name: item.product_name || '未命名商品',
        cost_price_text: money(item.cost_price),
        updated_at_text: normalizeDate(item.updated_at),
        stock_status_text: item.stock_status_text || stockStatusMeta(item.stock_status).text,
        stock_tag_class: stockStatusMeta(item.stock_status).className
    }));
    const visibleInventory = buildInventoryRows(inventory, inventoryFilter);
    const procurements = (data.procurements || []).map((item) => ({
        ...item,
        status_text: procurementStatusMeta(item.status).text,
        status_class: procurementStatusMeta(item.status).className,
        created_at_text: normalizeDate(item.created_at),
        received_at_text: normalizeDate(item.received_at)
    }));
    const recentStockLogs = (data.recent_stock_logs || []).map((item) => {
        const meta = stockLogTypeMeta(item.type);
        return {
            ...item,
            type_text: item.type_text || meta.text,
            type_class: meta.className,
            quantity_text: item.quantity_text || signedQuantityText(item.quantity_delta ?? item.quantity),
            created_at_text: normalizeDate(item.created_at),
            sku_display: buildInventorySkuText(item),
            station_name: item.station_name || '未命名门店',
            product_name: item.product_name || '未命名商品'
        };
    });
    return {
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
        procurements,
        inventory,
        visible_inventory: visibleInventory,
        recent_stock_logs: recentStockLogs,
        inventory_empty_text: buildInventoryEmptyText(inventory, procurements),
        summary: {
            ...summary,
            service_fee_total_text: money(summary.service_fee_total),
            principal_return_total_text: money(summary.principal_return_total)
        },
        focus_cards: [
            {
                key: 'pending',
                label: '待核销',
                value: pendingOrderCount,
                unit: '单',
                level: pendingOrderCount > 0 ? 'focus-hot' : 'focus-calm',
                hint: pendingOrderCount > 0 ? '优先处理顾客自提' : '暂无待处理订单'
            },
            {
                key: 'inventory',
                label: '库存预警',
                value: lowStockCount,
                unit: '项',
                level: lowStockCount > 0 ? 'focus-warn' : 'focus-calm',
                hint: lowStockCount > 0 ? '建议补货或确认库存' : '库存状态平稳'
            },
            {
                key: 'procurement',
                label: '采购在途',
                value: procurementPendingCount,
                unit: '单',
                level: procurementPendingCount > 0 ? 'focus-info' : 'focus-calm',
                hint: procurementPendingCount > 0 ? '等待审批或入库' : '暂无在途采购'
            }
        ]
    };
}

Page({
    data: {
        loading: true,
        scope: null,
        workbench: null,
        inventoryFilter: 'all',
        inventoryFilterLabel: '全部库存',
        showProcurementForm: false,
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
            const firstStationSubmitId = firstStation ? getStationSubmitId(firstStation) : '';
            if (!nextForm.station_id && firstStationSubmitId) {
                const receiveSnapshot = buildStationReceiveSnapshot(firstStation);
                nextForm.station_id = firstStationSubmitId;
                nextForm.station_name = firstStation.name || '';
                Object.assign(nextForm, receiveSnapshot);
            }
            const workbench = buildWorkbenchView(data, this.data.inventoryFilter);
            this.setData({
                loading: false,
                scope,
                workbench,
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

    toggleInventoryFilter(e) {
        const filter = e.currentTarget.dataset.filter === 'low' ? 'low' : 'all';
        if (filter === this.data.inventoryFilter) return;
        const workbench = this.data.workbench
            ? {
                ...this.data.workbench,
                visible_inventory: buildInventoryRows(this.data.workbench.inventory, filter)
            }
            : null;
        this.setData({
            inventoryFilter: filter,
            inventoryFilterLabel: filter === 'low' ? '只看预警' : '全部库存',
            workbench
        });
    },

    toggleProcurementForm() {
        this.setData({
            showProcurementForm: !this.data.showProcurementForm
        });
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
            'procurementForm.station_id': selected ? getStationSubmitId(selected) : '',
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
            const firstStation = this.data.scope?.stations?.[0] || null;
            const firstStationId = firstStation ? getStationSubmitId(firstStation) : '';
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
                skuOptions: [],
                showProcurementForm: false
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
            wx.navigateTo({ url: `/pages/pickup/orders?station_id=${getStationSubmitId(stations[0])}` });
            return;
        }
        wx.showActionSheet({
            itemList: stations.map((item) => item.name || '未命名门店'),
            success: (res) => {
                const station = stations[res.tapIndex];
                const stationId = getStationSubmitId(station);
                if (!stationId) return;
                wx.navigateTo({ url: `/pages/pickup/orders?station_id=${stationId}` });
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
