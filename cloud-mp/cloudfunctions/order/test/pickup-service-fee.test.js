'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function cloneRow(row) {
    return row && typeof row === 'object' ? { ...row } : row;
}

function matchesExpected(actual, expected) {
    if (expected && expected.__op === 'in') {
        return expected.values.some((value) => String(actual) === String(value));
    }
    if (expected && expected.__op === 'gte') {
        return actual >= expected.value;
    }
    if (expected && expected.__op === 'or') {
        return expected.conditions.some((condition) => matchesQuery({ value: actual }, { value: condition }));
    }
    return String(actual) === String(expected);
}

function matchesQuery(row, query = {}) {
    if (query && query.__op === 'or') {
        return query.conditions.some((condition) => matchesQuery(row, condition));
    }
    return Object.entries(query).every(([key, expected]) => matchesExpected(row[key], expected));
}

function applyUpdate(row, data = {}) {
    Object.entries(data).forEach(([key, value]) => {
        if (value && value.__op === 'remove') {
            delete row[key];
            return;
        }
        if (value && value.__op === 'inc') {
            row[key] = Number(row[key] || 0) + value.value;
            return;
        }
        row[key] = value;
    });
}

function createCollection(rows = []) {
    function createQuery(query = {}, offset = 0, limitCount = Infinity) {
        const scopedRows = () => rows.filter((row) => matchesQuery(row, query));
        return {
            where: (nextQuery = {}) => createQuery(nextQuery.__op === 'or' ? nextQuery : { ...query, ...nextQuery }, offset, limitCount),
            limit: (nextLimit) => createQuery(query, offset, nextLimit),
            skip: (nextOffset) => createQuery(query, nextOffset, limitCount),
            orderBy: () => createQuery(query, offset, limitCount),
            count: async () => ({ total: scopedRows().length }),
            get: async () => ({ data: scopedRows().slice(offset, offset + limitCount).map(cloneRow) }),
            update: async ({ data } = {}) => {
                const matched = scopedRows();
                matched.forEach((row) => applyUpdate(row, data));
                return { stats: { updated: matched.length } };
            }
        };
    }

    return {
        ...createQuery(),
        doc: (id) => ({
            get: async () => ({ data: cloneRow(rows.find((row) => String(row._id) === String(id)) || null) }),
            update: async ({ data } = {}) => {
                const row = rows.find((item) => String(item._id) === String(id));
                if (row) applyUpdate(row, data);
                return { stats: { updated: row ? 1 : 0 } };
            }
        }),
        add: async ({ data } = {}) => {
            const row = { _id: `generated-${rows.length + 1}`, ...data };
            rows.push(row);
            return { _id: row._id };
        }
    };
}

function createDb(collections) {
    return {
        command: {
            in: (values) => ({ __op: 'in', values: Array.isArray(values) ? values : [values] }),
            or: (conditions) => ({ __op: 'or', conditions }),
            inc: (value) => ({ __op: 'inc', value }),
            gte: (value) => ({ __op: 'gte', value }),
            remove: () => ({ __op: 'remove' })
        },
        serverDate: () => new Date('2026-05-04T00:00:00.000Z'),
        collection: (name) => createCollection(collections[name] || [])
    };
}

function loadOrderInteractive(db) {
    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'wx-server-sdk') {
            return {
                DYNAMIC_CURRENT_ENV: 'test-env',
                init: () => {},
                database: () => db,
                getWXContext: () => ({ OPENID: 'verifier-openid' })
            };
        }
        return originalLoad(request, parent, isMain);
    };

    const modulePaths = [
        require.resolve('../order-interactive'),
        require.resolve('../order-create'),
        require.resolve('../order-lifecycle'),
        require.resolve('../pickup-station-stock')
    ];
    modulePaths.forEach((modulePath) => { delete require.cache[modulePath]; });
    try {
        return require('../order-interactive');
    } finally {
        Module._load = originalLoad;
    }
}

test('legacy lottery point prize does not increase growth value', async () => {
    const collections = {
        configs: [
            {
                _id: 'lottery-config',
                config_key: 'lottery_config',
                config_value: { max_daily_draws: 3 }
            }
        ],
        lottery_records: [],
        lottery_prizes: [
            {
                _id: 'prize-points',
                name: '积分奖',
                type: 'points',
                prize_value: 12,
                probability: 1,
                is_active: true
            }
        ],
        users: [
            { _id: 'user-buyer', openid: 'buyer-openid', points: 20, growth_value: 99 }
        ],
        point_logs: []
    };
    const orderInteractive = loadOrderInteractive(createDb(collections));

    const result = await orderInteractive.lotteryDraw('buyer-openid', { lottery_id: 'default' });

    assert.equal(result.success, true);
    assert.equal(collections.users[0].points, 32);
    assert.equal(collections.users[0].growth_value, 99);
    assert.equal(collections.point_logs[0].amount, 12);
});

test('pickup verification creates service fee for active store manager when policy row is absent', async () => {
    const collections = {
        configs: [],
        app_configs: [],
        users: [
            { _id: 'user-verifier', id: 101, openid: 'verifier-openid', nickname: '核销员', role_level: 6 },
            { _id: 'user-manager', id: 202, openid: 'manager-openid', nickname: '店长', role_level: 6 }
        ],
        stations: [
            { _id: 'station-doc-1', id: 1, name: '问兰药业本部', status: 'active' }
        ],
        station_staff: [
            { _id: 'staff-verifier', station_id: 1, user_id: 101, openid: 'verifier-openid', role: 'staff', status: 'active', can_verify: 1 },
            { _id: 'staff-manager', station_id: 1, user_id: 202, openid: 'manager-openid', role: 'manager', status: 'active', can_verify: 1 }
        ],
        orders: [
            {
                _id: 'order-pickup-1',
                order_no: 'ORD-PICKUP-1',
                openid: 'buyer-openid',
                status: 'pickup_pending',
                delivery_type: 'pickup',
                pickup_station_id: 1,
                pickup_code: 'ABCDEFGH12345678',
                pay_amount: 88.85
            }
        ],
        commissions: [],
        station_sku_stocks: [],
        station_stock_logs: [],
        pickup_station_principal_logs: [],
        wallet_accounts: [],
        wallet_logs: [],
        goods_fund_logs: []
    };
    const orderInteractive = loadOrderInteractive(createDb(collections));

    const result = await orderInteractive.pickupVerifyCode('verifier-openid', {
        code: 'ABCDEFGH12345678',
        station_id: 1
    });

    assert.equal(result.success, true);
    const commission = collections.commissions.find((row) => row.type === 'pickup_service_fee');
    assert.ok(commission, 'expected pickup service fee commission');
    assert.equal(commission.openid, 'manager-openid');
    assert.equal(commission.order_id, 'order-pickup-1');
    assert.equal(commission.amount, 2.22);
    assert.equal(commission.status, 'frozen');
    assert.equal(collections.orders[0].status, 'completed');
});
