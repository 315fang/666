import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  Home, 
  Grid, 
  ShoppingCart, 
  User, 
  ChevronRight, 
  Share2, 
  Plus, 
  Minus, 
  Check, 
  ArrowLeft,
  Package,
  Wallet,
  Users,
  TrendingUp,
  Settings,
  MapPin,
  Clock,
  Heart,
  ExternalLink,
  Clipboard,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageWithFallback } from './components/figma/ImageWithFallback';

// --- Types ---
type Page = 'home' | 'category' | 'cart' | 'user' | 'detail' | 'checkout' | 'distribution' | 'workbench';
type UserRole = 'regular' | 'agent';

interface Product {
  id: number;
  title: string;
  price: number;
  agentPrice: number;
  originalPrice: number;
  image: string;
  tags: string[];
  isNew?: boolean;
  isHot?: boolean;
  sales: number;
  inventory: number;
}

// --- Mock Data ---
const PRODUCTS: Product[] = [
  {
    id: 1,
    title: '极简意式真皮手提包 高端定制系列',
    price: 3280,
    agentPrice: 2880,
    originalPrice: 4500,
    image: 'https://images.unsplash.com/photo-1760624294582-5341f33f9fa4?q=80&w=1080',
    tags: ['真皮', '新款'],
    isNew: true,
    sales: 128,
    inventory: 45
  },
  {
    id: 2,
    title: '午夜幽蓝 限量版沙龙香水 50ml',
    price: 899,
    agentPrice: 720,
    originalPrice: 1280,
    image: 'https://images.unsplash.com/photo-1759794108525-94ff060da692?q=80&w=1080',
    tags: ['限量', '香氛'],
    isHot: true,
    sales: 562,
    inventory: 12
  },
  {
    id: 3,
    title: '逆龄修护精华露 焕活肌底能量',
    price: 1560,
    agentPrice: 1320,
    originalPrice: 1880,
    image: 'https://images.unsplash.com/photo-1655568561429-2da330af5442?q=80&w=1080',
    tags: ['美妆', '高效'],
    isNew: true,
    sales: 342,
    inventory: 88
  },
  {
    id: 4,
    title: '18K金丝绒美钻项链 优雅传承',
    price: 12800,
    agentPrice: 11500,
    originalPrice: 15800,
    image: 'https://images.unsplash.com/photo-1721206625181-e4b529f5afe2?q=80&w=1080',
    tags: ['高级珠宝', '定制'],
    isHot: true,
    sales: 45,
    inventory: 5
  },
  {
    id: 5,
    title: '经典全自动机械腕表 睿智系列',
    price: 25800,
    agentPrice: 22800,
    originalPrice: 29800,
    image: 'https://images.unsplash.com/photo-1554151447-b9d2197448f9?q=80&w=1080',
    tags: ['名表', '绅士'],
    sales: 22,
    inventory: 8
  },
  {
    id: 6,
    title: '手工缝制 小牛皮经典运动鞋',
    price: 1880,
    agentPrice: 1580,
    originalPrice: 2200,
    image: 'https://images.unsplash.com/photo-1555145777-08bc06f96c63?q=80&w=1080',
    tags: ['轻便', '舒适'],
    isNew: true,
    sales: 189,
    inventory: 120
  }
];

// --- Components ---

const Tabbar = ({ current, onChange }: { current: Page, onChange: (p: Page) => void }) => {
  const tabs = [
    { id: 'home', label: '首页', icon: Home },
    { id: 'category', label: '分类', icon: Grid },
    { id: 'cart', label: '购物车', icon: ShoppingCart },
    { id: 'user', label: '我的', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] px-6 py-2 pb-safe flex justify-between items-center z-50">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id as Page)}
          className={`flex flex-col items-center gap-1 transition-colors ${current === tab.id ? 'text-[#2563EB]' : 'text-[#64748B]'}`}
        >
          <tab.icon size={24} strokeWidth={current === tab.id ? 2.5 : 2} />
          <span className="text-[20rpx] font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

const Header = ({ transparent = false, title = '', onBack }: { transparent?: boolean, title?: string, onBack?: () => void }) => {
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${transparent ? 'bg-transparent' : 'bg-white/90 backdrop-blur-md border-b border-[#E2E8F0]'}`}>
      <div className="h-24 flex items-center justify-between px-4 pt-8">
        <div className="flex items-center gap-3 flex-1">
          {onBack && (
            <button onClick={onBack} className="p-2 -ml-2">
              <ArrowLeft size={22} className={transparent ? 'text-white' : 'text-[#0F172A]'} />
            </button>
          )}
          {!title ? (
            <div className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${transparent ? 'bg-black/10' : 'bg-[#F8FAFC]'}`}>
              <Search size={18} className={transparent ? 'text-white' : 'text-[#64748B]'} />
              <input 
                type="text" 
                placeholder="搜索臻选商品" 
                className={`bg-transparent text-sm w-full outline-none ${transparent ? 'placeholder:text-white/70 text-white' : 'placeholder:text-[#94A3B8] text-[#0F172A]'}`}
              />
            </div>
          ) : (
            <h1 className={`text-lg font-bold ${transparent ? 'text-white' : 'text-[#0F172A]'}`}>{title}</h1>
          )}
        </div>
        <div className="flex items-center gap-4 ml-4">
          <div className="relative">
            <Bell size={22} className={transparent ? 'text-white' : 'text-[#0F172A]'} />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#EF4444] rounded-full border-2 border-white" />
          </div>
        </div>
      </div>
    </div>
  );
};

const ProductCard = ({ product, onClick }: { product: Product, onClick: () => void }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-[24rpx] overflow-hidden shadow-[0_4rpx_12rpx_rgba(15,23,42,0.05)] flex flex-col"
    >
      <div className="relative aspect-square">
        <ImageWithFallback src={product.image} className="w-full h-full object-cover" />
        {product.isNew && (
          <div className="absolute top-2 left-2 bg-[#2563EB] text-white text-[20rpx] px-2 py-0.5 rounded-[8rpx] font-bold z-10">NEW</div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5">
        <h3 className="text-[#0F172A] text-[26rpx] line-clamp-2 leading-tight font-medium h-9">{product.title}</h3>
        <div className="flex flex-wrap gap-1">
          {product.tags.map(tag => (
            <span key={tag} className="text-[#64748B] text-[20rpx] bg-[#F1F5F9] px-1.5 py-0.5 rounded-[4rpx]">{tag}</span>
          ))}
        </div>
        <div className="flex items-center justify-between mt-1 gap-1">
          <div className="flex items-baseline flex-wrap gap-1 flex-1 min-w-0">
            <span className="text-[#D97706] text-[20rpx] font-bold">¥</span>
            <span className="text-[#D97706] text-[32rpx] font-bold font-['DIN_Pro']">{product.price}</span>
            <span className="text-[#94A3B8] text-[20rpx] line-through truncate max-w-[80rpx]">¥{product.originalPrice}</span>
          </div>
          <button className="bg-[#0F172A] text-white text-[22rpx] px-3 py-1.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
            选购
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// --- Views ---

const HomeView = ({ onProductSelect }: { onProductSelect: (p: Product) => void }) => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="pb-32">
      <Header transparent={scrollY < 100} />
      
      {/* Banner - Reduced height for better visibility of content below */}
      <div className="relative h-[420rpx] overflow-hidden">
        <ImageWithFallback 
          src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        <div className="absolute bottom-8 left-6 text-white">
          <p className="text-[24rpx] tracking-[4rpx] opacity-80 mb-2">LIMITED EDITION</p>
          <h2 className="text-[48rpx] font-bold leading-tight">春季高奢秀场<br/>限时鉴赏系列</h2>
        </div>
      </div>

      {/* Grid Nav */}
      <div className="grid grid-cols-4 gap-4 px-6 py-6">
        {[
          { label: '新品上市', color: 'bg-blue-50', icon: '✨' },
          { label: '会员特惠', color: 'bg-amber-50', icon: '👑' },
          { label: '美妆个护', color: 'bg-pink-50', icon: '💄' },
          { label: '积分商城', color: 'bg-emerald-50', icon: '💎' },
        ].map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className={`w-14 h-14 ${item.color} rounded-2xl flex items-center justify-center text-2xl`}>
              {item.icon}
            </div>
            <span className="text-[24rpx] text-[#334155]">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Category Tabs */}
      <div className="flex gap-3 px-6 overflow-x-auto no-scrollbar py-2">
        {['精选推荐', '服饰箱包', '珠宝配饰', '数码家电', '居家生活'].map((cat, i) => (
          <button 
            key={cat}
            className={`whitespace-nowrap px-5 py-2 rounded-full text-[26rpx] font-medium transition-all ${i === 0 ? 'bg-[#0F172A] text-white shadow-lg' : 'bg-[#F1F5F9] text-[#64748B]'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Waterfall List */}
      <div className="px-4 py-6 grid grid-cols-2 gap-4">
        {PRODUCTS.map(product => (
          <ProductCard key={product.id} product={product} onClick={() => onProductSelect(product)} />
        ))}
      </div>
    </div>
  );
};

const CategoryView = ({ onProductSelect }: { onProductSelect: (p: Product) => void }) => {
  const [activeScenario, setActiveScenario] = useState(0);
  const scenarios = [
    { name: '居家生活', icon: '🏠' },
    { name: '美妆个护', icon: '✨' },
    { name: '服饰箱包', icon: '👜' },
    { name: '数码极客', icon: '💻' },
    { name: '美食美酒', icon: '🍷' },
  ];

  return (
    <div className="pt-20 pb-24">
      <Header title="分类浏览" />
      
      {/* Scenario Nav */}
      <div className="flex gap-4 px-6 overflow-x-auto no-scrollbar py-6">
        {scenarios.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveScenario(i)}
            className={`flex flex-col items-center gap-3 p-4 min-w-[140rpx] rounded-[24rpx] transition-all border-2 ${activeScenario === i ? 'bg-[#EFF6FF] border-[#2563EB]' : 'bg-white border-transparent'}`}
          >
            <span className="text-3xl">{s.icon}</span>
            <span className={`text-[24rpx] font-medium ${activeScenario === i ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>{s.name}</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="sticky top-20 bg-white z-30 px-6 py-3 border-b border-[#F1F5F9] flex justify-between items-center">
        <div className="flex gap-6">
          <span className="text-[28rpx] font-bold text-[#2563EB]">综合</span>
          <span className="text-[28rpx] text-[#64748B]">销量</span>
          <div className="flex items-center gap-1">
            <span className="text-[28rpx] text-[#64748B]">价格</span>
            <div className="flex flex-col scale-75">
              <Plus size={8} />
              <Minus size={8} />
            </div>
          </div>
        </div>
      </div>

      {/* List View */}
      <div className="px-4 py-4 flex flex-col gap-4">
        {PRODUCTS.map(p => (
          <motion.div 
            key={p.id} 
            whileTap={{ scale: 0.98 }}
            onClick={() => onProductSelect(p)}
            className="flex gap-4 bg-white p-3 rounded-[24rpx] shadow-sm relative"
          >
            <div className="w-[180rpx] h-[180rpx] rounded-[16rpx] overflow-hidden flex-shrink-0">
              <ImageWithFallback src={p.image} className="w-full h-full object-cover" />
              {p.isHot && (
                <div className="absolute top-2 left-2 bg-[#EF4444] text-white text-[18rpx] px-1.5 py-0.5 rounded-[4rpx] font-bold">HOT</div>
              )}
            </div>
            <div className="flex-1 flex flex-col justify-between py-1">
              <div>
                <h3 className="text-[28rpx] font-medium text-[#0F172A] line-clamp-2">{p.title}</h3>
                <p className="text-[22rpx] text-[#94A3B8] mt-1">月销 {p.sales}+ 件</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-[#D97706] text-[20rpx] font-bold">¥</span>
                  <span className="text-[#D97706] text-[36rpx] font-bold font-['DIN_Pro']">{p.price}</span>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    // Quick add logic
                  }}
                  className="w-8 h-8 bg-[#0F172A] text-white rounded-full flex items-center justify-center shadow-md"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const ProductDetailView = ({ product, role, onBack, onAddToCart, onBuyNow }: { 
  product: Product, 
  role: UserRole, 
  onBack: () => void,
  onAddToCart: (p: Product) => void,
  onBuyNow: (p: Product) => void
}) => {
  const [selectedSpec, setSelectedSpec] = useState('默认规格');

  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-24">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-10 h-24">
        <button onClick={onBack} className="w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg">
          <ArrowLeft size={20} className="text-[#0F172A]" />
        </button>
        <button className="w-10 h-10 bg-white/80 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg">
          <Share2 size={20} className="text-[#0F172A]" />
        </button>
      </div>

      {/* Hero - Optimized aspect ratio to show content below on first screen */}
      <div className="w-full aspect-[4/5] max-h-[70vh] bg-white relative overflow-hidden">
        <ImageWithFallback src={product.image} className="w-full h-full object-cover" />
        <div className="absolute bottom-4 right-4 bg-black/40 text-white text-[22rpx] px-3 py-1 rounded-full backdrop-blur-md">1/5</div>
      </div>

      <div className="p-6 space-y-4">
        {/* Price & Title */}
        <div className="bg-white p-5 rounded-[32rpx] shadow-sm">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[#D97706] text-[32rpx] font-bold">¥</span>
            <span className="text-[#D97706] text-[56rpx] font-bold font-['DIN_Pro']">{product.price}</span>
            <span className="text-[#94A3B8] text-[28rpx] line-through ml-2">¥{product.originalPrice}</span>
            <span className="ml-auto text-[24rpx] text-[#64748B]">已售 {product.sales}</span>
          </div>
          
          {role === 'agent' && (
            <div className="bg-gradient-to-r from-[#D97706] to-[#F59E0B] p-3 rounded-2xl flex items-center justify-between text-white mb-4 shadow-inner">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} />
                <span className="text-[26rpx] font-medium">代理��特权：分享赚 ¥{product.price - product.agentPrice}</span>
              </div>
              <ChevronRight size={18} />
            </div>
          )}

          <h1 className="text-[36rpx] font-semibold text-[#0F172A] leading-tight mb-3">{product.title}</h1>
          <div className="flex gap-2">
            <span className="bg-[#EFF6FF] text-[#2563EB] text-[22rpx] px-2 py-1 rounded-[8rpx]">官方正品</span>
            <span className="bg-[#F0FDF4] text-[#10B981] text-[22rpx] px-2 py-1 rounded-[8rpx]">顺丰包邮</span>
            <span className="bg-[#FEF2F2] text-[#EF4444] text-[22rpx] px-2 py-1 rounded-[8rpx]">七天无理由</span>
          </div>
        </div>

        {/* Specs */}
        <div className="bg-white p-5 rounded-[24rpx] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-[#64748B] text-[26rpx]">已选</span>
            <span className="text-[#0F172A] text-[26rpx] font-medium">{selectedSpec}</span>
          </div>
          <ChevronRight size={20} className="text-[#94A3B8]" />
        </div>

        {/* Service */}
        <div className="bg-white p-5 rounded-[24rpx] shadow-sm">
          <div className="flex justify-between items-center text-[26rpx]">
            <div className="flex gap-4">
              <div className="flex items-center gap-1"><Check size={14} className="text-[#10B981]" />正品保障</div>
              <div className="flex items-center gap-1"><Check size={14} className="text-[#10B981]" />24H发货</div>
            </div>
            <ChevronRight size={20} className="text-[#94A3B8]" />
          </div>
        </div>

        {/* Detail */}
        <div className="bg-white p-5 rounded-[24rpx] shadow-sm">
          <h2 className="text-[32rpx] font-bold text-[#0F172A] mb-4">图文详情</h2>
          <div className="space-y-4">
            <p className="text-[28rpx] text-[#334155] leading-relaxed">
              每一处细节都经过精心雕琢，采用顶级材质与传统工艺相结合。该系列旨在为追求极致生活品质的您提供最完美的体验。
            </p>
            <ImageWithFallback src="https://images.unsplash.com/photo-1549439602-43ebca2327af?q=80&w=1200" className="w-full rounded-2xl" />
            <ImageWithFallback src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=1200" className="w-full rounded-2xl" />
          </div>
        </div>
      </div>

      {/* Action Bar - Redesigned for premium feel */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-4 py-3 pb-safe flex items-center gap-3 z-50">
        <div className="flex flex-col items-center justify-center w-14 h-10 text-[#64748B] shrink-0">
          <ShoppingCart size={22} strokeWidth={1.5} />
          <span className="text-[18rpx] mt-0.5">购物车</span>
        </div>
        
        <div className="flex-1 flex gap-2">
          {role === 'agent' && (
            <button className="flex-1 bg-[#B45309] text-white h-11 rounded-full text-[24rpx] font-bold shadow-sm whitespace-nowrap">
              采购入仓
            </button>
          )}
          <button 
            onClick={() => onAddToCart(product)}
            className="flex-1 bg-[#F1F5F9] text-[#0F172A] h-11 rounded-full text-[24rpx] font-bold whitespace-nowrap"
          >
            加入购物车
          </button>
          <button 
            onClick={() => onBuyNow(product)}
            className="flex-[1.2] bg-[#2563EB] text-white h-11 rounded-full text-[24rpx] font-bold shadow-md shadow-blue-100 whitespace-nowrap"
          >
            立即购买
          </button>
        </div>
      </div>
    </div>
  );
};

const CartView = ({ items, onRemove, onUpdateQty, onCheckout }: { 
  items: { product: Product, qty: number }[],
  onRemove: (id: number) => void,
  onUpdateQty: (id: number, delta: number) => void,
  onCheckout: () => void
}) => {
  const total = items.reduce((acc, item) => acc + item.product.price * item.qty, 0);

  if (items.length === 0) {
    return (
      <div className="pt-20 pb-24 min-h-screen flex flex-col items-center justify-center px-10">
        <div className="w-32 h-32 bg-[#F1F5F9] rounded-full flex items-center justify-center text-5xl mb-6 opacity-50">🛒</div>
        <h2 className="text-[32rpx] font-bold text-[#0F172A] mb-2">购物车空空如也</h2>
        <p className="text-[26rpx] text-[#64748B] text-center mb-8">去挑选一些心仪的臻选商品吧</p>
        <button className="w-full bg-[#0F172A] text-white py-3 rounded-full font-bold">去逛逛</button>
      </div>
    );
  }

  return (
    <div className="pt-20 pb-40 min-h-screen bg-[#F8FAFC]">
      <Header title="购物车" />
      <div className="px-4 py-4 space-y-4">
        {items.map(item => (
          <div key={item.product.id} className="bg-white p-4 rounded-[32rpx] flex gap-4 shadow-sm relative group">
            <div className="w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0">
              <ImageWithFallback src={item.product.image} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 flex flex-col justify-between py-1">
              <div>
                <div className="flex justify-between">
                  <h3 className="text-[28rpx] font-semibold text-[#0F172A] line-clamp-1">{item.product.title}</h3>
                  <button onClick={() => onRemove(item.product.id)} className="text-[#94A3B8] opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="rotate-45" size={18} />
                  </button>
                </div>
                <p className="text-[22rpx] text-[#94A3B8] mt-1">已选: 默认规格</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-1">
                  <span className="text-[#D97706] text-[20rpx] font-bold">¥</span>
                  <span className="text-[#D97706] text-[32rpx] font-bold">{item.product.price}</span>
                </div>
                <div className="flex items-center bg-[#F8FAFC] rounded-full px-2 py-1 border border-[#E2E8F0]">
                  <button onClick={() => onUpdateQty(item.product.id, -1)} className="p-1"><Minus size={14} /></button>
                  <span className="w-8 text-center text-[26rpx] font-bold">{item.qty}</span>
                  <button onClick={() => onUpdateQty(item.product.id, 1)} className="p-1"><Plus size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Bar */}
      <div className="fixed bottom-20 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-[#E2E8F0] px-6 py-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-[#2563EB] rounded-full flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-[#2563EB] rounded-full" />
          </div>
          <span className="text-[26rpx] text-[#0F172A]">全选</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[22rpx] text-[#64748B]">合计</p>
            <p className="text-[36rpx] font-bold text-[#D97706]">¥{total}</p>
          </div>
          <button 
            onClick={onCheckout}
            className="bg-[#2563EB] text-white px-10 py-3 rounded-full font-bold shadow-lg shadow-blue-200"
          >
            去结算
          </button>
        </div>
      </div>
    </div>
  );
};

const UserView = ({ role, onSwitchRole, onNavigate }: { role: UserRole, onSwitchRole: () => void, onNavigate: (p: Page) => void }) => {
  return (
    <div className="pb-40 bg-[#F8FAFC] min-h-screen">
      {/* Header Profile - Non-floating version to fix overlap */}
      <div className="bg-[#0F172A] pt-24 pb-20 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        
        <div className="relative flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-2 border-amber-400 p-1">
              <ImageWithFallback src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200" className="w-full h-full rounded-full object-cover" />
            </div>
            <div className="absolute bottom-0 right-0 bg-amber-500 text-white p-1 rounded-full border-2 border-[#0F172A]">
               <Settings size={12} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-white text-[36rpx] font-bold">臻选会员_886</h2>
              <button className="text-white/60"><Plus size={16} className="rotate-45" /></button>
            </div>
            <div className="inline-flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
               <span className="text-[20rpx] text-amber-400 font-bold uppercase tracking-wider">{role === 'agent' ? '高级代理商' : '白金会员'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-10 relative z-10 space-y-4">
        {/* Assets Row - Now integrated into normal flow */}
        <div className="bg-white rounded-[32rpx] shadow-xl p-5 flex justify-between">
          <div className="text-center flex-1">
            <p className="text-[32rpx] font-bold text-[#0F172A] font-['DIN_Pro']">8,560.00</p>
            <p className="text-[22rpx] text-[#64748B] mt-1 whitespace-nowrap">累计收益</p>
          </div>
          <div className="w-px bg-gray-100 my-1" />
          <div className="text-center flex-1">
            <p className="text-[32rpx] font-bold text-[#0F172A] font-['DIN_Pro']">2,480.50</p>
            <p className="text-[22rpx] text-[#64748B] mt-1 whitespace-nowrap">账户余额</p>
          </div>
          <div className="w-px bg-gray-100 my-1" />
          <div className="text-center flex-1">
            <p className="text-[32rpx] font-bold text-[#0F172A] font-['DIN_Pro']">156</p>
            <p className="text-[22rpx] text-[#64748B] mt-1 whitespace-nowrap">团队人数</p>
          </div>
        </div>

        {/* Order Area */}
        <div className="bg-white p-5 rounded-[32rpx] shadow-sm">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-[30rpx] font-bold text-[#0F172A]">我的订单</h3>
              <div className="flex items-center gap-1 text-[#64748B] text-[24rpx]">
                全部订单 <ChevronRight size={14} />
              </div>
           </div>
           <div className="grid grid-cols-5 gap-1">
              {[
                { label: '待付款', icon: Wallet },
                { label: '待发货', icon: Package },
                { label: '待收货', icon: Truck },
                { label: '待评价', icon: Heart },
                { label: '退款售后', icon: ExternalLink },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2 relative">
                  <div className="w-10 h-10 flex items-center justify-center text-[#334155]">
                    <item.icon size={22} strokeWidth={1.5} />
                  </div>
                  <span className="text-[22rpx] text-[#64748B] whitespace-nowrap scale-95">{item.label}</span>
                  {i === 1 && (
                    <div className="absolute top-0 right-1 w-4 h-4 bg-[#EF4444] text-white text-[16rpx] flex items-center justify-center rounded-full border border-white font-bold">2</div>
                  )}
                </div>
              ))}
           </div>
        </div>

        {/* Grid Menu */}
        <div className="bg-white p-5 rounded-[32rpx] shadow-sm grid grid-cols-4 gap-y-6 gap-x-2">
           {[
             { label: '我的钱包', icon: Wallet, color: 'text-blue-500' },
             { label: '分佣中心', icon: TrendingUp, color: 'text-amber-500', target: 'distribution' },
             { label: '我的团队', icon: Users, color: 'text-emerald-500' },
             { label: '邀请好友', icon: Share2, color: 'text-purple-500' },
             { label: '收货地址', icon: MapPin, color: 'text-orange-500' },
             { label: '官方通知', icon: Bell, color: 'text-red-500' },
             { label: '设置中心', icon: Settings, color: 'text-slate-500' },
             { label: '帮助反馈', icon: Clock, color: 'text-teal-500' },
           ].map((item, i) => (
             <button key={i} onClick={() => item.target && onNavigate(item.target as Page)} className="flex flex-col items-center gap-2">
                <div className={`w-11 h-11 bg-gray-50 rounded-2xl flex items-center justify-center ${item.color}`}>
                   <item.icon size={20} strokeWidth={2} />
                </div>
                <span className="text-[22rpx] text-[#334155] whitespace-nowrap scale-95 font-medium">{item.label}</span>
             </button>
           ))}
        </div>

        <button 
          onClick={onSwitchRole}
          className="w-full text-[24rpx] text-[#94A3B8] flex items-center justify-center gap-2 py-4"
        >
          <Settings size={14} /> 调试：切换角色 ({role === 'agent' ? '代理商' : '普通用户'})
        </button>
      </div>
    </div>
  );
};

const DistributionView = ({ onBack, onNavigate }: { onBack: () => void, onNavigate: (p: Page) => void }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="bg-gradient-to-b from-[#0F172A] to-[#1E293B] pt-16 pb-32 px-6">
        <button onClick={onBack} className="text-white mb-6">
           <ArrowLeft size={24} />
        </button>
        <div className="text-center text-white">
           <p className="text-white/60 text-[24rpx] mb-2">累计佣金 (元)</p>
           <h1 className="text-[72rpx] font-bold font-['DIN_Pro'] mb-8">45,280.50</h1>
           <div className="flex justify-around">
              <div>
                 <p className="text-white/60 text-[22rpx] mb-1">本月预估收入</p>
                 <p className="text-[32rpx] font-bold">¥12,450</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div>
                 <p className="text-white/60 text-[22rpx] mb-1">待结算金额</p>
                 <p className="text-[32rpx] font-bold">¥3,280</p>
              </div>
           </div>
        </div>
      </div>

      <div className="px-6 -mt-20 space-y-4">
        {/* New Agent Workbench Entry inside Distribution */}
        <motion.div 
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('workbench')}
          className="bg-[#0F172A] p-5 rounded-[32rpx] text-white flex items-center justify-between shadow-xl"
        >
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
                <Package size={24} />
              </div>
              <div>
                 <h3 className="text-[30rpx] font-bold">代理商工作台</h3>
                 <p className="text-[22rpx] text-white/60">库存管理与发货处理入口</p>
              </div>
           </div>
           <ChevronRight size={20} />
        </motion.div>

        <button className="w-full bg-amber-500 text-white py-4 rounded-full font-bold shadow-lg shadow-amber-900/20 text-[32rpx]">
           佣金提现
        </button>

        <div className="bg-white rounded-[32rpx] p-6 shadow-sm grid grid-cols-2 gap-4">
           <div 
             onClick={() => onNavigate('workbench')}
             className="bg-[#F8FAFC] p-5 rounded-2xl flex flex-col gap-3"
           >
              <Package className="text-blue-500" size={24} />
              <div>
                 <p className="text-[30rpx] font-bold text-[#0F172A]">云仓库存</p>
                 <p className="text-[22rpx] text-[#64748B]">256 件商品待发</p>
              </div>
           </div>
           <div className="bg-[#F8FAFC] p-5 rounded-2xl flex flex-col gap-3">
              <Users className="text-emerald-500" size={24} />
              <div>
                 <p className="text-[30rpx] font-bold text-[#0F172A]">我的团队</p>
                 <p className="text-[22rpx] text-[#64748B]">156 名直推成员</p>
              </div>
           </div>
           <div className="bg-[#F8FAFC] p-5 rounded-2xl flex flex-col gap-3">
              <TrendingUp className="text-amber-500" size={24} />
              <div>
                 <p className="text-[30rpx] font-bold text-[#0F172A]">分销订单</p>
                 <p className="text-[22rpx] text-[#64748B]">本月 452 笔成交</p>
              </div>
           </div>
           <div className="bg-[#F8FAFC] p-5 rounded-2xl flex flex-col gap-3">
              <Settings className="text-slate-500" size={24} />
              <div>
                 <p className="text-[30rpx] font-bold text-[#0F172A]">发货设置</p>
                 <p className="text-[22rpx] text-[#64748B]">管理物流模板</p>
              </div>
           </div>
        </div>

        <div className="bg-white rounded-[32rpx] p-6 shadow-sm">
           <h3 className="text-[30rpx] font-bold text-[#0F172A] mb-4">佣金明细</h3>
           <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between items-center">
                   <div className="flex gap-4">
                      <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                         <ShoppingCart size={18} />
                      </div>
                      <div>
                         <p className="text-[26rpx] font-medium text-[#0F172A]">订单分佣收益</p>
                         <p className="text-[22rpx] text-[#94A3B8]">2026-02-09 14:30</p>
                      </div>
                   </div>
                   <p className="text-[30rpx] font-bold text-[#10B981]">+85.50</p>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

const WorkbenchView = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      <div className="fixed top-0 left-0 right-0 bg-white border-b border-[#E2E8F0] z-50 flex items-center gap-4 px-4 pt-10 h-24">
         <button onClick={onBack} className="text-[#0F172A]"><ArrowLeft size={24} /></button>
         <h1 className="text-[32rpx] font-bold">发货工作台</h1>
      </div>

      <div className="pt-28 px-4 space-y-4">
         {/* Inventory Summary */}
         <div className="bg-[#0F172A] p-6 rounded-[32rpx] text-white">
            <div className="flex justify-between items-start mb-6">
               <div>
                  <p className="text-white/60 text-[24rpx]">云仓总库存</p>
                  <h2 className="text-[56rpx] font-bold font-['DIN_Pro']">1,248</h2>
               </div>
               <button className="bg-white/10 px-4 py-2 rounded-full text-[24rpx]">采购入仓</button>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-4">
               <div>
                  <p className="text-white/60 text-[20rpx]">待发货</p>
                  <p className="text-[30rpx] font-bold">12</p>
               </div>
               <div>
                  <p className="text-white/60 text-[20rpx]">待收货</p>
                  <p className="text-[30rpx] font-bold">45</p>
               </div>
               <div>
                  <p className="text-white/60 text-[20rpx]">预警商品</p>
                  <p className="text-[30rpx] font-bold text-amber-400">2</p>
               </div>
            </div>
         </div>

         {/* Order Tabs */}
         <div className="flex border-b border-[#E2E8F0]">
            {['待发货', '待确认', '已发货'].map((tab, i) => (
              <button key={tab} className={`flex-1 py-4 text-[28rpx] font-medium relative ${i === 0 ? 'text-[#2563EB]' : 'text-[#64748B]'}`}>
                {tab}
                {i === 0 && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#2563EB] rounded-full" />}
              </button>
            ))}
         </div>

         {/* Order Cards */}
         {[1, 2].map(i => (
           <div key={i} className="bg-white p-5 rounded-[32rpx] shadow-sm space-y-4">
              <div className="flex justify-between items-center">
                 <span className="text-[24rpx] text-[#94A3B8]">订单号: ZX20260209886{i}</span>
                 <span className="text-[#2563EB] text-[24rpx] font-medium">待发货</span>
              </div>
              <div className="flex gap-4">
                 <div className="w-16 h-16 rounded-xl bg-gray-100 flex-shrink-0" />
                 <div className="flex-1">
                    <p className="text-[26rpx] font-medium text-[#0F172A] line-clamp-1">极简意式真皮手提包 高端定制系列...</p>
                    <p className="text-[22rpx] text-[#94A3B8] mt-1">收货人: 李*华 138****8888</p>
                 </div>
              </div>
              <div className="bg-[#F8FAFC] p-3 rounded-xl text-[22rpx] text-[#64748B]">
                 地址: 广东省广州市天河区珠江新城XX大厦...
              </div>
              <div className="flex justify-end gap-3">
                 <button className="px-5 py-2 rounded-full border border-[#E2E8F0] text-[24rpx] text-[#64748B]">联系买家</button>
                 <button className="px-5 py-2 rounded-full bg-[#0F172A] text-white text-[24rpx] font-bold flex items-center gap-2">
                    <Truck size={14} /> 填单号发货
                 </button>
              </div>
           </div>
         ))}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [userRole, setUserRole] = useState<UserRole>('agent');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartItems, setCartItems] = useState<{ product: Product, qty: number }[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleProductSelect = (p: Product) => {
    setSelectedProduct(p);
    setCurrentPage('detail');
  };

  const handleAddToCart = (p: Product) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === p.id);
      if (existing) {
        return prev.map(item => item.product.id === p.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { product: p, qty: 1 }];
    });
    // Optional: show toast
  };

  const handleBuyNow = (p: Product) => {
    handleAddToCart(p);
    setCurrentPage('cart');
  };

  const handleRemoveFromCart = (id: number) => {
    setCartItems(prev => prev.filter(item => item.product.id !== id));
  };

  const handleUpdateQty = (id: number, delta: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.product.id === id) {
        const newQty = Math.max(1, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }));
  };

  const handleCheckout = () => {
    setShowSuccessModal(true);
    setCartItems([]);
  };

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen relative font-sans text-[#334155]">
      <AnimatePresence mode="wait">
        {currentPage === 'home' && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <HomeView onProductSelect={handleProductSelect} />
          </motion.div>
        )}
        
        {currentPage === 'category' && (
          <motion.div key="category" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CategoryView onProductSelect={handleProductSelect} />
          </motion.div>
        )}

        {currentPage === 'cart' && (
          <motion.div key="cart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CartView 
              items={cartItems} 
              onRemove={handleRemoveFromCart} 
              onUpdateQty={handleUpdateQty}
              onCheckout={handleCheckout}
            />
          </motion.div>
        )}

        {currentPage === 'user' && (
          <motion.div key="user" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <UserView 
              role={userRole} 
              onSwitchRole={() => setUserRole(r => r === 'agent' ? 'regular' : 'agent')} 
              onNavigate={setCurrentPage}
            />
          </motion.div>
        )}

        {currentPage === 'detail' && selectedProduct && (
          <motion.div 
            key="detail" 
            initial={{ x: '100%' }} 
            animate={{ x: 0 }} 
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] overflow-y-auto no-scrollbar"
          >
            <ProductDetailView 
              product={selectedProduct} 
              role={userRole} 
              onBack={() => setCurrentPage('home')}
              onAddToCart={handleAddToCart}
              onBuyNow={handleBuyNow}
            />
          </motion.div>
        )}

        {currentPage === 'distribution' && (
          <motion.div 
            key="distribution" 
            initial={{ x: '100%' }} 
            animate={{ x: 0 }} 
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] overflow-y-auto"
          >
            <DistributionView onBack={() => setCurrentPage('user')} onNavigate={setCurrentPage} />
          </motion.div>
        )}

        {currentPage === 'workbench' && (
          <motion.div 
            key="workbench" 
            initial={{ x: '100%' }} 
            animate={{ x: 0 }} 
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[60] overflow-y-auto"
          >
            <WorkbenchView onBack={() => setCurrentPage('distribution')} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabbar - hidden on subpages */}
      {['home', 'category', 'cart', 'user'].includes(currentPage) && (
        <Tabbar current={currentPage} onChange={setCurrentPage} />
      )}

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-white w-full rounded-[48rpx] p-8 text-center"
             >
                <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">
                   🎉
                </div>
                <h2 className="text-[40rpx] font-bold text-[#0F172A] mb-2">订单提交成功</h2>
                <p className="text-[28rpx] text-[#64748B] mb-8">正在为您安排精选发货，请稍后...</p>
                <div className="space-y-3">
                   <button 
                     onClick={() => { setShowSuccessModal(false); setCurrentPage('home'); }}
                     className="w-full bg-[#2563EB] text-white py-4 rounded-full font-bold shadow-lg shadow-blue-200"
                   >
                     查看订单
                   </button>
                   <button 
                     onClick={() => { setShowSuccessModal(false); setCurrentPage('home'); }}
                     className="w-full py-4 text-[#64748B] font-medium"
                   >
                     返回首页
                   </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast simulated */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[1000]" id="toast-portal" />
    </div>
  );
}
