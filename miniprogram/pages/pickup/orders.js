const { get } = require('../../utils/request');
const { requireLogin } = require('../../utils/auth');

function formatDate(value) {
    if (!value) return '';
    return String(value).replace('T', ' ').slice(0, 16);
}

Page({
    data: {
        loading: true,
        stationId: '',
        station: null,
        list: [],
        page: 1,
        limit: 20,
        hasMore: true
    },

    onLoad(options) {
        if (!requireLogin()) {
            setTimeout(() => wx.navigateBack(), 100);
            return;
        }
        this.setData({
            stationId: options.station_id ? String(options.station_id) : ''
        });
        this.loadOrders();
    },

    async loadOrders(append = false) {
        this.setData({ loading: true });
        try {
            const page = append ? this.data.page : 1;
            const res = await get('/pickup/pending-orders', {
                station_id: this.data.stationId,
                page,
                limit: this.data.limit
            }, { showLoading: !append });

            const incoming = (res.data?.list || []).map((item) => ({
                ...item,
                created_at_text: formatDate(item.created_at),
                shipped_at_text: formatDate(item.shipped_at)
            }));

            this.setData({
                list: append ? this.data.list.concat(incoming) : incoming,
                station: res.data?.station || null,
                page: page + 1,
                hasMore: incoming.length === this.data.limit,
                loading: false
            });
        } catch (e) {
            this.setData({ loading: false });
        }
    },

    onLoadMore() {
        if (!this.data.loading && this.data.hasMore) {
            this.loadOrders(true);
        }
    },

    goVerifyPage() {
        const { stationId } = this.data;
        wx.navigateTo({ url: `/pages/pickup/verify${stationId ? `?station_id=${stationId}` : ''}` });
    },

    goOrderDetail(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        wx.navigateTo({ url: `/pages/order/detail?id=${id}` });
    }
});
