function callTabBarApi(methodName) {
    return new Promise((resolve) => {
        const api = wx && wx[methodName];
        if (typeof api !== 'function') {
            resolve();
            return;
        }

        api({
            animation: false,
            complete: () => resolve()
        });
    });
}

function syncPageTabBar(page, shouldHide) {
    if (!page) return Promise.resolve();
    if (!!page._nativeTabBarHidden === !!shouldHide) {
        return Promise.resolve();
    }

    page._nativeTabBarHidden = !!shouldHide;
    return callTabBarApi(shouldHide ? 'hideTabBar' : 'showTabBar');
}

function restorePageTabBar(page) {
    if (page) {
        page._nativeTabBarHidden = false;
    }
    return callTabBarApi('showTabBar');
}

module.exports = {
    syncPageTabBar,
    restorePageTabBar
};
