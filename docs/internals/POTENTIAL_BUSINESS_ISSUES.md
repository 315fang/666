# Potential Business Logic Issues

Based on frontend code review, here are potential business logic concerns that should be verified:

## 1. Commission Rate Hardcoding (High Priority)

**Location**: `qianduan/pages/distribution/invite.wxml:45, 49`

**Issue**: Commission rates are hardcoded in the frontend UI:
- Direct commission: "订单金额的 10%"
- Indirect commission: "间接推荐 5%"

**Risk**: If backend commission rates change (e.g., promotional periods, role-based rates, tiered rates), the frontend will display incorrect information to users.

**Recommendation**:
- Fetch commission rate configuration from backend API
- Display dynamic rates based on user's role/level
- Keep frontend and backend rates synchronized

## 2. Withdrawal Validation (Medium Priority)

**Location**: `qianduan/pages/wallet/index.js:94-104`

**Current Logic**:
```javascript
const amount = parseFloat(this.data.withdrawAmount);
if (!amount || amount <= 0) { /* reject */ }
if (amount > balance) { /* reject */ }
```

**Potential Issues**:
- No minimum withdrawal amount check
- No maximum withdrawal limit check
- No validation against `commissionOverview.available` (only checks total balance)
- No check for pending withdrawals (user could submit multiple)

**Recommendation**:
- Add minimum withdrawal amount validation (e.g., ¥10)
- Validate against `available` balance, not total balance
- Add backend check for concurrent withdrawal requests
- Consider withdrawal fee logic if applicable

## 3. Commission Status Display (Low Priority)

**Location**: `qianduan/pages/wallet/index.js:59-82`

**Current Mapping**:
- `frozen`: "冻结中(T+15)"
- `pending_approval`: "待审核"
- `approved`: "待结算"
- `settled`: "已结算"
- `cancelled`: "已取消"

**Hardcoded T+15**: The "T+15" freeze period is hardcoded in frontend. If backend business rules change this period (e.g., T+7 for certain products), frontend will show incorrect information.

**Recommendation**:
- Include freeze period in API response
- Display dynamic freeze deadline dates

## 4. Refund Deadline Display (Medium Priority)

**Location**: `qianduan/pages/wallet/index.js:49`

**Code**:
```javascript
refund_deadline: item.refund_deadline ? item.refund_deadline.split('T')[0] : null
```

**Issue**: Displays refund deadline date but no visual warning when deadline is approaching. Users may miss refund windows.

**Recommendation**:
- Add visual indicators for approaching deadlines (e.g., within 3 days)
- Consider countdown timers for urgent deadlines
- Send push notifications for deadline reminders

## 5. Agent Inventory Display (Low Priority)

**Location**: `qianduan/pages/distribution/team.wxml:31-35`

**Code**:
```xml
<view class="extra-item" wx:if="{{agentStockInfo}}">
  <text class="extra-label">代理商库存</text>
  <text class="extra-val">{{agentStockInfo.stock_count}}件</text>
</view>
```

**Potential Issue**: Shows inventory count but no indication of:
- What products are in stock
- Low stock warnings
- Stock value (important for agents to know capital tied up)

**Recommendation**:
- Link to detailed inventory page
- Show low stock warnings
- Display inventory value

## 6. Order Fulfillment Type Display (Medium Priority)

**Location**: `qianduan/pages/order/list.wxml:53`

**Code**:
```xml
<text class="fulfillment-tag" wx:if="{{item.fulfillment_type === 'Agent'}}">团队发货</text>
```

**Potential Issue**:
- Only shows tag for Agent fulfillment
- No indication of warehouse/platform fulfillment
- Users may be confused about who is shipping their order

**Recommendation**:
- Show fulfillment type for all orders (Platform发货 / 团队发货)
- Include estimated shipping time based on fulfillment type
- Show which agent is fulfilling if applicable

## 7. Refund Status Business Logic (Medium Priority)

**Location**: `qianduan/pages/order/list.wxml:56-86`

**Current Logic**: When `item.hasActiveRefund` is true, only shows "查看退款" button. All other action buttons are hidden.

**Potential Issue**: If refund is rejected or cancelled, the order may still have `hasActiveRefund = true` temporarily, preventing user from taking other actions (confirm receipt, refund again, etc.)

**Recommendation**:
- Ensure `hasActiveRefund` flag is updated promptly when refund completes/fails
- Consider showing order actions for cancelled/rejected refunds
- Add clear messaging about why actions are disabled

## 8. Price Display Formatting (Low Priority)

**Locations**: Multiple files (wallet, order list, team stats)

**Inconsistency**:
- Some places: `balance.toFixed(2)` (JavaScript)
- Some places: Direct display without formatting

**Issue**: Potential for displaying prices like "10" instead of "10.00", or precision issues with floating point math.

**Recommendation**:
- Standardize price formatting across all pages
- Consider using a utility function for consistent money formatting
- Ensure backend returns prices as strings or integers (cents) to avoid floating point issues

## 9. Empty State Data Handling (Low Priority)

**Locations**: All list pages

**Current Pattern**:
```javascript
{{directCount || 0}}
{{item.order_count || 0}}
```

**Issue**: Relies on JavaScript falsy coercion. If backend returns unexpected values (null, undefined, "", false), may display incorrectly.

**Recommendation**:
- Validate and normalize data in page .js files before passing to templates
- Use explicit null/undefined checks
- Consider default values in data() initialization

## 10. Team Stats Calculation (Medium Priority)

**Location**: `qianduan/pages/distribution/team.wxml:14-15`

**Code**:
```xml
<text class="stats-val">{{totalCount || 0}}</text>
<text class="stats-label">团队总数</text>
```

**Question**: Is `totalCount` = `directCount` + `indirectCount`, or does it include deeper levels?

For S2B2C systems with multi-level distribution:
- If only showing 2 levels, users with 3+ level teams may see incorrect totals
- Commission calculations may include deeper levels not shown in UI

**Recommendation**:
- Clarify team counting logic
- If multi-level (3+), consider showing "直推/二代/三代及以下"
- Ensure commission calculations match displayed team structure

## Summary

**High Priority**: Commission rate hardcoding
**Medium Priority**: Withdrawal validation, refund deadline warnings, fulfillment display, refund status logic, team stats
**Low Priority**: Status display T+15, agent inventory details, price formatting, empty states

All issues should be verified against backend business logic and actual user requirements.
