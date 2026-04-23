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
    Object.keys(page).filter((key) => key.startsWith('_timer_banner_') || key.startsWith('_timer_section_')).forEach((key) => {
        clearInterval(page[key]);
        page[key] = null;
    });
}

function formatCountdown(diff) {
    const safeDiff = Math.max(0, diff);
    return {
        days: String(Math.floor(safeDiff / 86400000)).padStart(2, '0'),
        hours: String(Math.floor((safeDiff % 86400000) / 3600000)).padStart(2, '0'),
        mins: String(Math.floor((safeDiff % 3600000) / 60000)).padStart(2, '0'),
        secs: String(Math.floor((safeDiff % 60000) / 1000)).padStart(2, '0')
    };
}

function startSectionCountdown(page, { sectionKey, cardKey, startTime, endTime }) {
    const timerKey = `_timer_section_${sectionKey}_${cardKey}`;
    if (page[timerKey]) clearInterval(page[timerKey]);

    const startTs = new Date(startTime).getTime();
    const endTs = new Date(endTime).getTime();
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs >= endTs) return;

    const tick = () => {
        const sections = Array.isArray(page.data.activitySections) ? page.data.activitySections : [];
        const sectionIdx = sections.findIndex((section) => String(section.key) === String(sectionKey));
        if (sectionIdx < 0) {
            clearInterval(page[timerKey]);
            return;
        }
        const cards = Array.isArray(sections[sectionIdx].subCards) ? sections[sectionIdx].subCards : [];
        const cardIdx = cards.findIndex((card) => String(card.key) === String(cardKey));
        if (cardIdx < 0) {
            clearInterval(page[timerKey]);
            return;
        }

        const now = Date.now();
        if (now >= endTs) {
            clearInterval(page[timerKey]);
            requestCache.deleteByPrefix('/limited-sales/overview');
            requestCache.deleteByPrefix('/limited-sales/detail');
            if (typeof page.loadConfig === 'function' && typeof page.loadActivityPreviews === 'function') {
                Promise.resolve()
                    .then(() => page.loadConfig())
                    .then(() => page.loadActivityPreviews())
                    .catch(() => null);
            }
            return;
        }

        const label = now < startTs ? '距开始' : '距结束';
        const targetTs = now < startTs ? startTs : endTs;
        page.setData({
            [`activitySections[${sectionIdx}].subCards[${cardIdx}].countdownLabel`]: label,
            [`activitySections[${sectionIdx}].subCards[${cardIdx}].countdown`]: formatCountdown(targetTs - now)
        });
    };

    tick();
    page[timerKey] = setInterval(tick, 1000);
}

module.exports = {
    startBannerCountdown,
    clearBannerTimers,
    startSectionCountdown
};
