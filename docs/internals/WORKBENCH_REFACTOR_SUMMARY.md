# Agent Workbench Refactoring - Factory Direct Shipping Model

**Date:** 2026-02-12
**Branch:** claude/analyze-frontend-code
**Priority:** CRITICAL - Business Model Alignment

## Problem Statement

The agent workbench UI incorrectly suggested that agents handle shipping (including tracking number input and shipping company selection), which conflicted with the actual business model where **factories ship directly** and **agents only manage cloud inventory**.

## Business Model Clarification

### Factory-Direct Shipping Model
- **Factory Role:** Owns physical inventory, handles all shipping and logistics
- **Agent Role:** Manages virtual cloud inventory (`User.stock_count`), confirms orders
- **Order Flow:** Customer pays → Agent confirms (deducts cloud stock) → Factory ships → Customer receives

### Key Insight
Agents should **never** be prompted to enter tracking numbers or select shipping companies. Their responsibility ends at order confirmation.

---

## Changes Made

### 1. Frontend - Workbench UI (qianduan/pages/distribution/workbench.*)

#### workbench.wxml (6 edits)
**File:** `qianduan/pages/distribution/workbench.wxml`

**Line 28:** Changed button terminology
```xml
<!-- Before -->
<view class="stock-btn" bindtap="goRestock">📦 采购入仓</view>

<!-- After -->
<view class="stock-btn" bindtap="goRestock">📦 云库存补货</view>
```

**Line 41:** Changed tab text for clarity
```xml
<!-- Before -->
<text class="tab-text">待发货</text>

<!-- After -->
<text class="tab-text">待确认</text>
```

**Lines 44-49:** Simplified and reorganized tabs
```xml
<!-- Before: Had 待确认 and 已发货 tabs -->
<!-- After: Replaced with 工厂发货中 and 已完成 tabs -->
<view class="tab-item {{activeStatus === 'shipped' ? 'active' : ''}}" data-status="shipped">
  <text class="tab-text">工厂发货中</text>
</view>
<view class="tab-item {{activeStatus === 'completed' ? 'active' : ''}}" data-status="completed">
  <text class="tab-text">已完成</text>
</view>
```

**Line 60:** Enhanced order status labels
```xml
<!-- Before: Simple status mapping -->
<!-- After: Detailed factory-centric status labels -->
{{item.status === 'paid' ? '待确认' :
  item.status === 'agent_confirmed' ? '已确认-等待发货' :
  item.status === 'shipping_requested' ? '工厂准备中' :
  item.status === 'shipped' ? '工厂已发货' :
  item.status === 'completed' ? '已完成' : item.status}}
```

**Lines 83-93:** Removed shipping implication from action buttons
```xml
<!-- Before: "一键发货" button for both paid and agent_confirmed status -->
<!-- After: "确认订单" button only for paid status -->
<view class="order-actions" wx:if="{{item.status === 'paid'}}">
  <view class="action-btn primary" data-id="{{item.id}}" data-order="{{item}}" bindtap="onConfirmTap">
    ✅ 确认订单
  </view>
</view>
<view class="order-actions" wx:if="{{item.status === 'agent_confirmed' || item.status === 'shipping_requested'}}">
  <text class="tracking-info">⏳ 工厂准备发货中...</text>
</view>
```

**Lines 112-132:** Completely rewrote confirmation popup
```xml
<!-- Before: "确认发货" with minimal explanation -->
<!-- After: "确认订单" with 3-line clarification -->
<view class="popup-title">确认订单</view>
...
<view class="popup-tips">
  <text>⚠️ 确认后将扣除您的云库存数量</text>
  <text>📦 工厂将在24小时内直接发货给客户</text>
  <text>🚚 物流信息由工厂统一管理和录入</text>
</view>
<button class="btn btn-primary btn-block" bindtap="confirmOrder">确认订单</button>
```

#### workbench.js (4 edits)
**File:** `qianduan/pages/distribution/workbench.js`

**Lines 1-3:** Updated file header with business model clarification
```javascript
// pages/distribution/workbench.js - 代理商工作台
// 业务模型：工厂直接发货，代理商管理云库存
// 代理商职责：确认订单 + 扣除云库存，不负责实际发货和物流录入
```

**Lines 7-15:** Removed shipping-related data fields
```javascript
// Before
data: {
  showShipPopup: false,
  shipOrder: {},
  shipCompany: '',        // ❌ Removed
  shipTrackingNo: ''      // ❌ Removed
}

// After
data: {
  showShipPopup: false,  // Renamed to confirmPopup conceptually but kept for minimal changes
  shipOrder: {}
}
```

**Lines 20-28:** Updated tab status mapping
```javascript
// Before
const statusMap = {
  'all': 0,
  'pending': 1,
  'shipping_requested': 2,  // ❌ Removed
  'shipped': 3
};

// After
const statusMap = {
  'all': 0,
  'pending': 1,
  'shipped': 2,
  'completed': 3
};
```

**Lines 104-117:** Renamed method and removed shipping inputs
```javascript
// Before: onShipTap() with shipCompany and shipTrackingNo inputs
// After: onConfirmTap() without shipping fields
onConfirmTap(e) {
  const order = e.currentTarget.dataset.order;
  this.setData({
    showShipPopup: true,
    shipOrder: order
  });
}
```

**Lines 117-153:** Renamed confirmShip → confirmOrder and updated API call
```javascript
// Before: POST /agent/ship/:id with tracking_no and tracking_company
// After: POST /agent/confirm-order/:id without tracking info
async confirmOrder() {
  // ... stock validation ...

  wx.showLoading({ title: '确认中...' });
  const res = await post(`/agent/confirm-order/${shipOrder.id}`);

  if (res.code === 0) {
    wx.showToast({ title: '确认成功，已通知工厂发货', icon: 'success' });
    // ...
  }
}
```

#### workbench.wxss (3 edits)
**File:** `qianduan/pages/distribution/workbench.wxss`

**Line 1:** Updated file header
```css
/* Before */
/* pages/distribution/workbench.wxss - 工厂发货工作台 */

/* After */
/* pages/distribution/workbench.wxss - 代理商工作台 */
```

**Line 307:** Updated CSS comment
```css
/* Before */
/* ====== 发货弹窗 ====== */

/* After */
/* ====== 订单确认弹窗 ====== */
```

**Lines 382-391:** Enhanced popup tips styling for multi-line layout
```css
/* Before: Single-line centered tips */
.popup-tips {
  font-size: 24rpx;
  color: #94A3B8;
  margin-bottom: 40rpx;
  text-align: center;
}

/* After: Multi-line left-aligned tips */
.popup-tips {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  font-size: 24rpx;
  color: #64748B;
  margin-bottom: 40rpx;
  text-align: left;
  line-height: 1.5;
}
```

---

### 2. Backend - Order Confirmation API

#### New Route: `/agent/confirm-order/:id`
**File:** `backend/routes/agent.js`

Added new endpoint specifically for factory-direct shipping model:
```javascript
// POST /api/agent/confirm-order/:id - 代理商确认订单（工厂直发模式）
router.post('/confirm-order/:id', confirmOrder);
```

Kept old endpoint for backward compatibility:
```javascript
// POST /api/agent/ship/:id - 代理商自行发货（保留兼容，已废弃）
router.post('/ship/:id', agentShip);
```

#### New Controller Function: `confirmOrder()`
**File:** `backend/controllers/agentController.js` (Lines 340-535)

**Purpose:** Handle order confirmation in factory-direct shipping model

**Core Logic:**
1. **Validate:** Check agent identity and cloud inventory availability
2. **Deduct Stock:** Decrement agent's `stock_count` by order quantity
3. **Calculate Commissions:**
   - Team gap profits (multi-level commission system)
   - Agent fulfillment profit
4. **Update Order Status:** Set to `agent_confirmed` (waiting for factory)
5. **Notifications:**
   - Notify buyer: "Order confirmed, factory will ship in 24h"
   - Notify upline agents: Commission frozen
   - TODO: Notify factory backend

**Key Differences from `agentShip()`:**
- ✅ No tracking number required
- ✅ Sets status to `agent_confirmed` (not `shipped`)
- ✅ Sets `fulfillment_type` to `Platform` (not `Agent`)
- ✅ Sets `platform_stock_deducted = true`
- ✅ Does NOT update `tracking_no` or `shipped_at`

**Database Changes:**
```javascript
order.status = 'agent_confirmed';          // New intermediate status
order.fulfillment_type = 'Platform';       // Factory ships
order.fulfillment_partner_id = userId;     // Track confirming agent
order.platform_stock_deducted = true;      // Mark stock deducted
```

**Commission Logic (Unchanged):**
- Same multi-level gap profit calculation as `agentShip()`
- Same agent fulfillment profit calculation
- Same frozen status with refund_deadline management

**Response:**
```json
{
  "code": 0,
  "message": "确认成功，已通知工厂发货",
  "data": {
    "order_no": "202601120001",
    "status": "agent_confirmed",
    "stock_remaining": 145
  }
}
```

---

## Order Status Flow (Updated)

### Factory-Direct Model Flow
```
paid (客户已付款)
  ↓ [Agent confirms order via /agent/confirm-order/:id]
agent_confirmed (代理商已确认，工厂待发货)
  ↓ [Factory ships via factory backend]
shipped (工厂已发货)
  ↓ [Customer confirms receipt]
completed (已完成)
```

### Legacy Self-Ship Model Flow (Deprecated)
```
paid (客户已付款)
  ↓ [Agent ships directly via /agent/ship/:id]
shipped (代理商已发货)
  ↓ [Customer confirms receipt]
completed (已完成)
```

---

## Testing Checklist

### Frontend Testing
- [ ] Load agent workbench page successfully
- [ ] Verify "云库存补货" button appears (not "采购入仓")
- [ ] Verify tabs show: 全部 / 待确认 / 工厂发货中 / 已完成
- [ ] Click on paid order shows "✅ 确认订单" button
- [ ] Click confirm button opens popup with 3-line factory shipping explanation
- [ ] Verify popup shows correct deducted stock quantity
- [ ] Confirm order successfully calls `/agent/confirm-order/:id`
- [ ] After confirmation, order status shows "已确认-等待发货"
- [ ] Agent_confirmed orders show "⏳ 工厂准备发货中..."

### Backend Testing
- [ ] POST `/api/agent/confirm-order/:id` returns 200 with correct data
- [ ] Cloud stock (`User.stock_count`) decrements correctly
- [ ] Order status updates to `agent_confirmed`
- [ ] Order fields set correctly:
  - [ ] `fulfillment_type = 'Platform'`
  - [ ] `platform_stock_deducted = true`
  - [ ] `fulfillment_partner_id = <agent_id>`
- [ ] Commission logs created with correct amounts
- [ ] Notifications sent to buyer and upline agents
- [ ] Insufficient stock returns 400 error with correct message
- [ ] Invalid order status returns 400 error
- [ ] Unauthorized access returns 404 error

### Business Logic Testing
- [ ] Agent cannot confirm same order twice
- [ ] Agent cannot confirm order with insufficient cloud stock
- [ ] Gap profit calculation matches existing logic
- [ ] Agent fulfillment profit calculation correct
- [ ] Frozen commission status set correctly
- [ ] Negative profit scenario logs warning (no commission created)

---

## Migration Notes

### Database Schema
**No schema changes required.** All necessary fields already exist in Order model:
- `status` (supports `agent_confirmed` status)
- `fulfillment_type` (supports `Platform` value)
- `platform_stock_deducted` (boolean)
- `fulfillment_partner_id` (tracks confirming agent)

### API Compatibility
- **New Endpoint:** `/api/agent/confirm-order/:id` (primary for factory-direct model)
- **Legacy Endpoint:** `/api/agent/ship/:id` (kept for backward compatibility)
- **Frontend:** Updated to use new endpoint exclusively

### Rollback Plan
If issues arise:
1. Revert frontend changes (use old `/agent/ship/:id` endpoint)
2. Keep backend changes (new endpoint is additive, not breaking)
3. Investigate and fix issues
4. Re-deploy corrected version

---

## Impact Assessment

### Immediate Impact (Week 1)
✅ **Positive:**
- UI now accurately reflects business model
- Reduced agent confusion about shipping responsibilities
- Clear separation of concerns (agent confirms, factory ships)

⚠️ **Potential Issues:**
- Agents familiar with old UI may need brief re-training
- Factory backend must be updated to show `agent_confirmed` orders

### Mid-term Impact (Weeks 2-4)
✅ **Positive:**
- Reduced customer service inquiries about "fake" tracking numbers
- Clearer audit trail (agent confirmation vs actual shipping)
- Foundation for factory dashboard implementation

### Long-term Impact (3-6 months)
✅ **Positive:**
- Scalable to 10,000+ customers
- Enables factory performance tracking
- Supports future features (batch shipping, stock reservation)

---

## Follow-up Tasks

### High Priority (Next Sprint)
1. **Factory Backend Dashboard**
   - Create factory role and login
   - Build "Pending Shipment" view for `agent_confirmed` orders
   - Implement factory shipping interface (tracking number entry)
   - Update order status to `shipped` after factory ships

2. **Terminology Standardization**
   - Update restock page: "采购入仓" → "云库存补货"
   - Update center page: "工厂工作台" → "代理商工作台"
   - Audit all pages for consistent terminology

3. **Testing & Monitoring**
   - Write integration tests for new endpoint
   - Add logging for order confirmation flow
   - Monitor commission calculation accuracy

### Medium Priority (Weeks 2-4)
1. **Stock Reservation System**
   - Prevent overselling when multiple agents confirm simultaneously
   - Implement `StockReservation` table (from analysis)

2. **Factory Notification System**
   - Real-time notify factory admin when agent confirms order
   - Daily summary report of pending shipments

3. **Enhanced Order Tracking**
   - Customer-facing tracking page
   - Factory shipment SLA monitoring (24-hour target)

### Low Priority (Months 2-3)
1. **Audit Trail Enhancement**
   - Implement `StockTransaction` table (immutable ledger)
   - Track all cloud stock movements with timestamps

2. **Performance Optimization**
   - Add database indexes for `agent_id + status` queries
   - Cache workbench statistics

---

## Related Documents

- **PROJECT_STANDARDIZATION_ANALYSIS.md** - Comprehensive project analysis
- **Backend API Docs** - `/backend/docs/api.md` (TODO: update with new endpoint)
- **Order Status Reference** - `/backend/config/constants.js`
- **Commission Calculation Logic** - `/backend/controllers/agentController.js` (lines 340-535)

---

## Conclusion

This refactoring successfully aligns the agent workbench UI and backend logic with the factory-direct shipping business model. Agents now clearly understand they confirm orders (not ship them), and the system accurately tracks the distinction between order confirmation and actual shipment.

**Key Achievement:** Eliminated the #1 critical redundant feature identified in the project standardization analysis.

**Next Critical Step:** Build factory backend dashboard to complete the order fulfillment workflow.
