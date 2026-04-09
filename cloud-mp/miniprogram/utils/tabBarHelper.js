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
    const tabBar = typeof page.getTabBar === 'function' ? page.getTabBar() : null;
    if (tabBar && typeof tabBar.setHidden === 'function') {
        tabBar.setHidden(!!shouldHide);
        return Promise.resolve();
    }
    return callTabBarApi(shouldHide ? 'hideTabBar' : 'showTabBar');
}

function restorePageTabBar(page) {
    if (page) {
        page._nativeTabBarHidden = false;
        const tabBar = typeof page.getTabBar === 'function' ? page.getTabBar() : null;
        if (tabBar && typeof tabBar.setHidden === 'function') {
            tabBar.setHidden(false);
            return Promise.resolve();
        }
    }
    return callTabBarApi('showTabBar');
}

module.exports = {
    syncPageTabBar,
    restorePageTabBar
};
