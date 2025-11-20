// app/modules/db.js
(function () {
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    ns.api = ns.api || {};
    ns.state = ns.state || {};

    const DB_KEY = 'litepos_bdt_db_v1';
    ns.api.DB_KEY = DB_KEY;

    ns.api.defaultDb = function () {
        return {
            version: 1,
            shop: { name: 'LitePOS Demo Shop', address: '', phone: '' },
            users: [],
            customers: [],
            products: [],
            sales: [],
            counters: { nextSaleId: 1 },
            flags: { seededSampleData: false }
        };
    };

    ns.api.seedSampleData = function (target) {
        if (!target) return;
        if (target.flags && target.flags.seededSampleData) return;

        target.products = [
            { id: 'p1', name: 'Milk 1L', sku: 'MILK-1L', buyPrice: 80, sellPrice: 95, stock: 30, lowStockAt: 5, createdAt: new Date().toISOString() },
            { id: 'p2', name: 'Eggs (Dozen)', sku: 'EGG-12', buyPrice: 110, sellPrice: 130, stock: 20, lowStockAt: 4, createdAt: new Date().toISOString() },
            { id: 'p3', name: 'Rice 5kg', sku: 'RICE-5KG', buyPrice: 450, sellPrice: 520, stock: 15, lowStockAt: 3, createdAt: new Date().toISOString() }
        ];

        target.customers = [
            { id: 'c1', name: 'Walk-in', phone: '', notes: 'Default walk-in customer', lastSaleAt: null, lastSaleTotal: 0 },
            { id: 'c2', name: 'Rahim Uddin', phone: '01711111111', notes: 'Nearby grocery shop regular', lastSaleAt: null, lastSaleTotal: 0 }
        ];

        target.flags = target.flags || {};
        target.flags.seededSampleData = true;
    };

    ns.api.loadDb = function () {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) {
            const base = ns.api.defaultDb();
            // Seed a superadmin on first run
            base.users.push({ id: 'u1', name: 'Superadmin', username: 'admin', pin: '1234', role: 'superadmin', createdAt: new Date().toISOString() });
            ns.api.seedSampleData(base);
            ns.state.db = base;
            localStorage.setItem(DB_KEY, JSON.stringify(ns.state.db));
            return base;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed.version) parsed.version = 1;
            if (!parsed.counters) parsed.counters = { nextSaleId: 1 };
            if (!parsed.flags) parsed.flags = { seededSampleData: false };
            ns.state.db = parsed;
            return parsed;
        } catch (e) {
            console.error('Failed to parse DB, resetting.', e);
            const base = ns.api.defaultDb();
            ns.api.seedSampleData(base);
            ns.state.db = base;
            localStorage.setItem(DB_KEY, JSON.stringify(ns.state.db));
            return base;
        }
    };

    ns.api.saveDb = function (next) {
        ns.state.db = next || ns.state.db;
        localStorage.setItem(DB_KEY, JSON.stringify(ns.state.db));
    };

})();
