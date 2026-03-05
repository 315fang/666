/**
 * ec-canvas 组件 - 适配标准 echarts + 微信小程序 Canvas 2D API
 * 
 * 用法：
 * <ec-canvas id="mychart" canvas-id="mychart" ec="{{ ec }}"></ec-canvas>
 * 
 * ec 对象格式：
 * {
 *   lazyLoad: false,        // 是否懒加载
 *   onInit: function(chart) {} // 图表初始化回调
 * }
 */

var echarts = require('./echarts.js');

// 兼容小程序的 Canvas 上下文包装器
function wrapCanvas(canvas, width, height, dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    var ctx = canvas.getContext('2d');
    // 伪造 document 环境让 echarts 可以创建 canvas
    return {
        getContext: function (t) {
            return ctx;
        },
        setAttribute: function () { },
        addEventListener: function () { },
        removeEventListener: function () { },
        width: width * dpr,
        height: height * dpr,
        style: {
            width: width + 'px',
            height: height + 'px'
        }
    };
}

Component({
    properties: {
        canvasId: {
            type: String,
            value: 'ec-canvas'
        },
        ec: {
            type: Object
        },
        forceUseOldCanvas: {
            type: Boolean,
            value: false
        }
    },
    data: {},
    attached: function () {
        if (!this.data.ec) {
            console.warn('[ec-canvas] 需绑定 ec 变量，例：<ec-canvas ec="{{ ec }}"></ec-canvas>');
            return;
        }
        if (this.data.ec.lazyLoad) {
            this.isDisposed = true;
            return;
        }
        this._initChart();
    },
    detached: function () {
        if (this.chart) {
            this.chart.dispose();
        }
    },
    methods: {
        _initChart: function () {
            var self = this;
            var query = wx.createSelectorQuery().in(this);
            query.select('#' + this.data.canvasId)
                .fields({ node: true, size: true })
                .exec(function (res) {
                    if (!res || !res[0]) {
                        // 降级：尝试老的 2d canvas 方式
                        self._initChartOld();
                        return;
                    }
                    var canvas = res[0].node;
                    var width = res[0].width;
                    var height = res[0].height;
                    var dpr = wx.getSystemInfoSync().pixelRatio;

                    canvas.width = width * dpr;
                    canvas.height = height * dpr;

                    var ctx = canvas.getContext('2d');
                    var chart = echarts.init(canvas, null, {
                        width: width,
                        height: height,
                        devicePixelRatio: dpr
                    });

                    self.chart = chart;

                    // 事件代理
                    canvas.$$chart = chart;

                    if (self.data.ec && self.data.ec.onInit) {
                        self.data.ec.onInit(chart);
                    }
                    self.triggerEvent('inited', { chart: chart });
                });
        },

        _initChartOld: function () {
            var self = this;
            var dpr = wx.getSystemInfoSync().pixelRatio;
            var query = wx.createSelectorQuery().in(this);
            query.select('#' + this.data.canvasId)
                .boundingClientRect(function (rect) {
                    if (!rect) return;
                    var width = rect.width;
                    var height = rect.height;
                    var ctx = wx.createCanvasContext(self.data.canvasId, self);
                    // 使用离屏canvas模拟
                    var chart = echarts.init(null, null, {
                        renderer: 'canvas',
                        width: width,
                        height: height,
                        devicePixelRatio: dpr,
                        ssr: true  // 服务端渲染模式
                    });
                    self.chart = chart;
                    if (self.data.ec && self.data.ec.onInit) {
                        self.data.ec.onInit(chart);
                    }
                    self.triggerEvent('inited', { chart: chart });
                })
                .exec();
        },

        // 获取 chart 实例
        getChart: function () {
            return this.chart;
        },

        // 手势事件代理
        touchStart: function (e) {
            if (this.chart) {
                this.chart.dispatchAction({ type: 'showTip', event: e });
            }
        },
        touchMove: function (e) { },
        touchEnd: function (e) { }
    }
});
