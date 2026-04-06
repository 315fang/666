const { consumePendingRegisterPrompt } = require('../../utils/lightPrompt');

function onCardTouchStart(page, event) {
    page.startY = event.touches[0].clientY;
    page.setData({ isPulling: true });
}

function onCardTouchMove(page, event) {
    const moveY = event.touches[0].clientY;
    const diff = moveY - page.startY;
    if (diff > 0 && diff < 150) {
        page.setData({ cardTransform: diff * 0.6 });
    }
}

function onCardTouchEnd(page) {
    page.setData({
        cardTransform: 0,
        isPulling: false
    });
}

function tryPendingRegisterLightTip(page) {
    const prompt = consumePendingRegisterPrompt();
    if (!prompt) return;
    page.setData({
        lightTipShow: true,
        lightTipTitle: prompt.title,
        lightTipContent: prompt.content || ''
    });
}

function onLightTipClose(page) {
    page.setData({ lightTipShow: false });
}

function preventTap() {
    // 阻止冒泡
}

function stopP() {}

function onShareTap() {
    // 触发转发分享
}

module.exports = {
    onCardTouchEnd,
    onCardTouchMove,
    onCardTouchStart,
    onLightTipClose,
    onShareTap,
    preventTap,
    stopP,
    tryPendingRegisterLightTip
};
