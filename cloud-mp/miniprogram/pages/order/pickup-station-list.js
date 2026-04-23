// pages/order/pickup-station-list.js - 自提门店选择
function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function resolveStationId(station = {}) {
    return String(station.id || station._id || '');
}

function buildSearchText(station = {}) {
    return [
        station.name,
        station.province,
        station.city,
        station.district,
        station.address,
        station.full_address,
        station.contact_phone,
        station.contact_phone_text
    ].map(compactText).join(' ').toLowerCase();
}

function filterStations(stations = [], keyword = '') {
    const key = compactText(keyword).toLowerCase();
    if (!key) return stations;
    return stations.filter((station) => buildSearchText(station).includes(key));
}

Page({
    data: {
        keyword: '',
        stations: [],
        filteredStations: [],
        selectedId: ''
    },

    onLoad() {
        const payload = wx.getStorageSync('pickupStationSelectPayload') || {};
        const stations = (Array.isArray(payload.stations) ? payload.stations : [])
            .map((station) => {
                const stationKey = resolveStationId(station);
                return {
                    ...station,
                    id: station.id || station._id || stationKey,
                    station_key: stationKey
                };
            });
        const selectedId = String(payload.selectedId || '');
        this.setData({
            stations,
            filteredStations: stations,
            selectedId
        });
    },

    onSearchInput(e) {
        const keyword = e.detail.value || '';
        this.setData({
            keyword,
            filteredStations: filterStations(this.data.stations, keyword)
        });
    },

    onClearSearch() {
        this.setData({
            keyword: '',
            filteredStations: this.data.stations
        });
    },

    onSelectStation(e) {
        const id = String(e.currentTarget.dataset.id || '');
        const station = (this.data.stations || []).find((item) => resolveStationId(item) === id);
        if (!station) return;
        if (station.selectable === false) {
            wx.showToast({ title: '该门店当前无货，请选择有货门店', icon: 'none' });
            return;
        }
        wx.setStorageSync('selectedPickupStation', station);
        wx.navigateBack();
    }
});
