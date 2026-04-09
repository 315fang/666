const { requestCache } = require('../../utils/requestCache');

function startBannerCountdown(page, endTimeStr, slideId) {
    const key = `_timer_banner_${slideId}`;
    if (page[key]) clearInterval(page[key]);

    const tick = () => {
        const slides = [...page.data.bannerSlides];
        const idx = slides.findIndex((slide) => String(slide.id) === String(slideId));
        if (idx < 0) {
            clearInterval(page[key]);
            return;
        }
        const diff = Math.max(0, new Date(endTimeStr).getTime() - Date.now());
        if (diff === 0) {
            clearInterval(page[key]);
            requestCache.deleteByPrefix('/activity/festival-config');
            requestCache.deleteByPrefix('/page-content');
            slides.splice(idx, 1);
            const nextIdx = Math.min(page.data.bannerIndex, Math.max(0, slides.length - 1));
            page.setData({ bannerSlides: slides, bannerIndex: nextIdx });
            return;
        }
        page.setData({
            [`bannerSlides[${idx}].countdown`]: {
                days: String(Math.floor(diff / 86400000)).padStart(2, '0'),
                hours: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
                mins: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
                secs: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
            }
        });
    };
    tick();
    page[key] = setInterval(tick, 1000);
}

function clearBannerTimers(page) {
    Object.keys(page).filter((key) => key.startsWith('_timer_banner_')).forEach((key) => {
        clearInterval(page[key]);
        page[key] = null;
    });
}

module.exports = {
    startBannerCountdown,
    clearBannerTimers
};
