const assert = require('node:assert/strict');

const PricingService = require('../../services/PricingService');

test('purchase tier member overrides guest role pricing', () => {
  const product = {
    retail_price: 100,
    price_member: 90,
    price_leader: 80,
    price_agent: 70
  };

  const price = PricingService.calculateDisplayPrice(product, null, 0, 'member');
  assert.equal(price, 90);
});

test('purchase tier leader uses sku wholesale price', () => {
  const product = { retail_price: 100, price_member: 90, price_leader: 80, price_agent: 70 };
  const sku = { retail_price: 100, member_price: 88, wholesale_price: 78, price_agent: 68 };

  const price = PricingService.calculateDisplayPrice(product, sku, 0, 'leader');
  assert.equal(price, 78);
});

test('invalid purchase tier falls back to role level pricing', () => {
  const product = {
    retail_price: 100,
    price_member: 90,
    price_leader: 80,
    price_agent: 70
  };

  const price = PricingService.calculateDisplayPrice(product, null, 2, 'unknown-tier');
  assert.equal(price, 80);
});
