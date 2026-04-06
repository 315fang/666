function createLoginExpiredHandler(ErrorHandler) {
    let isRefreshingToken = false;
    let refreshSubscribers = [];

    function onTokenRefreshed() {
        refreshSubscribers.forEach((callback) => callback());
        refreshSubscribers = [];
    }

    function addRefreshSubscriber(callback) {
        refreshSubscribers.push(callback);
    }

    return function handleLoginExpired() {
        if (isRefreshingToken) {
            return new Promise((resolve) => {
                addRefreshSubscriber(() => resolve());
            });
        }

        isRefreshingToken = true;
        ErrorHandler.handleLoginExpired();

        return new Promise((resolve) => {
            setTimeout(() => {
                isRefreshingToken = false;
                onTokenRefreshed();
                resolve();
            }, 1500);
        });
    };
}

module.exports = {
    createLoginExpiredHandler
};
