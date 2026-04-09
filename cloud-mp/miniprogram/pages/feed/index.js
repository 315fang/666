// pages/feed/index.js
Page({
    data: {
        userName: '生活家',
        boxCount: 0,
        cards: [],
        currentIndex: 0,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        cardTransform: '',
        cardRotate: '',
        nopeOpacity: 0,
        likeOpacity: 0,
        isDragging: false,
        loading: false,
        aiUnavailable: true
    },

    onLoad() {
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo && userInfo.nickname) {
            this.setData({ userName: userInfo.nickname });
        }
    },

    onShow() {
        this.setData({
            boxCount: wx.getStorageSync('boxList')?.length || 0
        });
    },

    refreshFeed() {
        this.setData({
            cards: [],
            currentIndex: 0,
            loading: false,
            cardTransform: '',
            nopeOpacity: 0,
            likeOpacity: 0,
            currentX: 0
        });
        wx.showToast({ title: 'AI 甄选已下线', icon: 'none' });
    },

    touchStart(e) {
        if (this.data.currentIndex >= this.data.cards.length) return;
        this.setData({
            isDragging: true,
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY
        });
    },

    touchMove(e) {
        if (!this.data.isDragging) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - this.data.startX;
        const deltaY = currentY - this.data.startY;
        const rotate = deltaX * 0.05;
        const opacityDrop = Math.min(1, Math.abs(deltaX) / 150);

        this.setData({
            currentX: deltaX,
            currentY: deltaY,
            cardTransform: `transform: translateX(${deltaX}px) translateY(${deltaY}px) rotate(${rotate}deg);`,
            nopeOpacity: deltaX < 0 ? opacityDrop : 0,
            likeOpacity: deltaX > 0 ? opacityDrop : 0
        });
    },

    touchEnd() {
        if (!this.data.isDragging) return;
        this.setData({ isDragging: false });
        const deltaX = this.data.currentX;

        if (deltaX > 90) {
            this.handleSwipeAction('right');
        } else if (deltaX < -90) {
            this.handleSwipeAction('left');
        } else {
            this.resetCardPosition();
        }
    },

    forceSwipeLeft() {
        this.handleSwipeAction('left', true);
    },

    forceSwipeRight() {
        this.handleSwipeAction('right', true);
    },

    handleSwipeAction(direction, isButtonClick = false) {
        if (this.data.currentIndex >= this.data.cards.length) return;

        const card = this.data.cards[this.data.currentIndex];

        if (isButtonClick) {
            const flyX = direction === 'right' ? 500 : -500;
            this.setData({
                cardTransform: `transform: translateX(${flyX}px) translateY(50px) rotate(${direction === 'right' ? 20 : -20}deg); transition: transform 0.4s ease-out;`,
                nopeOpacity: direction === 'left' ? 1 : 0,
                likeOpacity: direction === 'right' ? 1 : 0
            });
        }

        wx.vibrateShort({ type: 'medium' });

        setTimeout(() => {
            if (direction === 'right' && card) {
                this.addToBox(card);
            }

            this.setData({
                currentIndex: this.data.currentIndex + 1,
                cardTransform: '',
                nopeOpacity: 0,
                likeOpacity: 0,
                currentX: 0,
                currentY: 0
            });
        }, 300);
    },

    resetCardPosition() {
        this.setData({
            cardTransform: 'transform: translateX(0) translateY(0) rotate(0); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);',
            nopeOpacity: 0,
            likeOpacity: 0,
            currentX: 0,
            currentY: 0
        });
        setTimeout(() => {
            this.setData({ cardTransform: '' });
        }, 300);
    },

    addToBox(product) {
        const list = wx.getStorageSync('boxList') || [];
        if (!list.find((item) => item.id === product.id)) {
            list.push(product);
            wx.setStorageSync('boxList', list);
            wx.showToast({ title: '已入定见箱', icon: 'none' });
            this.setData({ boxCount: list.length });
        }
    },

    goToBox() {
        wx.navigateTo({ url: '/pages/cart/cart' });
    }
});
