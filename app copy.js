// app.js - LitePOS — BDT
// Pure browser POS using LocalStorage (no backend, no external libs)

(function () {
    'use strict';

    // -------------------------
    // CONSTANTS & GLOBAL STATE
    // -------------------------

    const DB_KEY = 'litepos_bdt_db_v1';
    const SESSION_KEY = 'litepos_bdt_session_v1';

    const ROLE_SUPERADMIN = 'superadmin';
    const ROLE_SALES = 'sales';

    let db = null;
    let currentUser = null;
    let currentSale = null;      // in-memory current sale (open / new)
    let lastClosedSaleId = null; // track last closed sale for printing

    // Cached DOM references
    const els = {};

    // -------------------------
    // INIT
    // -------------------------

    window.addEventListener('DOMContentLoaded', () => {
        cacheElements();
        attachGlobalHandlers();
        db = loadDb();
        initSession();
        decideLoginOrMain();
    });

    // -------------------------
    // DB / SESSION
    // -------------------------

    function defaultDb() {
        return {
            version: 1,
            shop: {
                name: 'LitePOS Demo Shop',
                address: 'Noakhali Science & Technology University, Sonapur, Noakhali',
                phone: '01800-000000'
            },
            users: [],
            customers: [],
            products: [],
            sales: [],
            counters: {
                nextSaleId: 1
            },
            flags: {
                seededSampleData: false
            }
        };
    }

    function loadDb() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) {
            const base = defaultDb();
            // Seed one superadmin user only on absolute first run; user will change PIN/name anyway
            base.users.push({
                id: 'u1',
                name: 'Superadmin',
                username: 'admin',
                pin: '1234', // strongly suggested to change at first login
                role: ROLE_SUPERADMIN,
                createdAt: new Date().toISOString()
            });
            seedSampleData(base);
            saveDb(base);
            return base;
        }
        try {
            const parsed = JSON.parse(raw);
            // Minimal shape guard
            if (!parsed.version) parsed.version = 1;
            if (!parsed.counters) parsed.counters = { nextSaleId: 1 };
            if (!parsed.flags) parsed.flags = { seededSampleData: false };
            return parsed;
        } catch (e) {
            console.error('Failed to parse DB, resetting.', e);
            const base = defaultDb();
            seedSampleData(base);
            saveDb(base);
            return base;
        }
    }

    function saveDb(next) {
        db = next || db;
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }

    function seedSampleData(target) {
        if (target.flags && target.flags.seededSampleData) return;

        target.products = [
            {
                id: 'p1',
                name: 'Milk 1L',
                sku: 'MILK-1L',
                buyPrice: 80,
                sellPrice: 95,
                stock: 30,
                lowStockAt: 5,
                createdAt: new Date().toISOString()
            },
            {
                id: 'p2',
                name: 'Eggs (Dozen)',
                sku: 'EGG-12',
                buyPrice: 110,
                sellPrice: 130,
                stock: 20,
                lowStockAt: 4,
                createdAt: new Date().toISOString()
            },
            {
                id: 'p3',
                name: 'Rice 5kg',
                sku: 'RICE-5KG',
                buyPrice: 450,
                sellPrice: 520,
                stock: 15,
                lowStockAt: 3,
                createdAt: new Date().toISOString()
            }
        ];

        target.customers = [
            {
                id: 'c1',
                name: 'Walk-in',
                phone: '',
                notes: 'Default walk-in customer',
                lastSaleAt: null,
                lastSaleTotal: 0
            },
            {
                id: 'c2',
                name: 'Rahim Uddin',
                phone: '01711111111',
                notes: 'Nearby grocery shop regular',
                lastSaleAt: null,
                lastSaleTotal: 0
            }
        ];

        target.flags.seededSampleData = true;
    }

    function loadSession() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function saveSession(session) {
        if (!session) {
            localStorage.removeItem(SESSION_KEY);
        } else {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
    }

    function initSession() {
        const session = loadSession();
        if (!session) return;
        const user = db.users.find(u => u.id === session.userId);
        if (user) {
            currentUser = user;
        } else {
            saveSession(null);
        }
    }

    // -------------------------
    // DOM CACHE
    // -------------------------

    function cacheElements() {
        const ids = [
            'login-screen', 'main-screen',
            'header-shop-name', 'header-shop-address', 'header-shop-phone',
            'header-user-label', 'header-user-role', 'header-session-pill',
            'btn-logout',

            // Login / setup
            'setup-panel', 'signin-panel',
            'setup-name', 'setup-username', 'setup-pin', 'setup-pin-confirm',
            'btn-setup-create',
            'login-user', 'login-pin', 'btn-login',

            // Tabs
            'tab-sale', 'tab-customers', 'tab-products', 'tab-sales', 'tab-reports', 'tab-admin',

            // POS: customer, products, cart, sale controls
            'sale-customer-phone', 'sale-customer-name', 'btn-search-customer',
            'summary-customer-name', 'summary-customer-meta', 'summary-customer-status',
            'quick-customer-name', 'quick-customer-notes', 'btn-save-quick-customer',
            'btn-clear-customer',
            'product-search', 'product-table-body',
            'cart-table-body',
            'btn-new-sale', 'btn-hold-sale', 'btn-cancel-sale', 'btn-clear-cart',
            'open-sales-list',
            'input-discount', 'input-payment',
            'summary-subtotal', 'summary-total', 'summary-items-count',
            'summary-change', 'summary-sale-status',
            'btn-complete-sale',
            'receipt-size', 'btn-print-last-receipt',
            'today-summary-small', 'today-salesperson-name', 'today-last-sale',

            // Receipt
            'receipt-print', 'receipt-shop-name', 'receipt-shop-address', 'receipt-shop-phone',
            'receipt-sale-meta', 'receipt-items-body',
            'receipt-subtotal', 'receipt-discount', 'receipt-total', 'receipt-payment', 'receipt-change',

            // Customers tab
            'customer-search', 'customers-table-body',
            'customer-edit-name', 'customer-edit-phone', 'customer-edit-notes',
            'btn-save-customer-edit', 'btn-new-customer',

            // Products tab
            'product-manage-search', 'products-table-body',
            'product-edit-name', 'product-edit-sku',
            'product-edit-buy', 'product-edit-sell',
            'product-edit-stock', 'product-edit-low',
            'btn-save-product', 'btn-new-product',

            // Sales tab
            'sales-filter-from', 'sales-filter-to',
            'sales-filter-status', 'sales-filter-user',
            'sales-filter-query', 'btn-sales-clear-filters',
            'sales-table-body',

            // Reports
            'kpi-total-sales', 'kpi-total-sales-count',
            'kpi-today-sales', 'kpi-today-sales-count',
            'kpi-total-profit', 'kpi-profit-margin',
            'kpi-customers-count', 'kpi-open-sales',
            'salesChart',
            'report-from', 'report-to',
            'btn-export-csv', 'btn-print-report',
            'report-print-area', 'report-print-period', 'report-print-body',

            // Admin
            'shop-name', 'shop-address', 'shop-phone',
            'btn-save-shop-settings',
            'users-table-body',
            'user-edit-name', 'user-edit-username', 'user-edit-pin', 'user-edit-role',
            'btn-save-user', 'btn-new-user',
            'btn-backup-download', 'backup-file-input',

            // Toast container
            'toast-container'
        ];

        ids.forEach(id => {
            els[id] = document.getElementById(id);
        });

        els.navButtons = Array.from(document.querySelectorAll('.nav-btn'));
        els.navAdminButtons = Array.from(document.querySelectorAll('.nav-admin-only'));
    }

    // -------------------------
    // LOGIN / SETUP / MAIN
    // -------------------------

    function decideLoginOrMain() {
        // If no users at all, force setup
        const hasUsers = db.users && db.users.length > 0;

        if (!hasUsers) {
            showSetupOnly();
            return;
        }

        populateLoginUserSelect();

        if (currentUser) {
            showMainScreen();
            loadShopIntoHeader();
            applyRoleUI();
            startNewSale();
            refreshAllViews();
        } else {
            showLoginOnly();
        }
    }

    function showSetupOnly() {
        els.login-screen.classList.remove('hidden');
        els.main-screen.classList.add('hidden');
        els.setup-panel.classList.remove('hidden');
        els.signin-panel.classList.add('hidden');
    }

    function showLoginOnly() {
        els.login-screen.classList.remove('hidden');
        els.main-screen.classList.add('hidden');
        els.setup-panel.classList.add('hidden');
        els.signin-panel.classList.remove('hidden');
        populateLoginUserSelect();
    }

    function showMainScreen() {
        els.login-screen.classList.add('hidden');
        els.main-screen.classList.remove('hidden');
        focusCustomerPhone();
    }

    function populateLoginUserSelect() {
        const sel = els['login-user'];
        if (!sel) return;
        sel.innerHTML = '';
        db.users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.role === ROLE_SUPERADMIN ? 'Superadmin' : 'Sales'})`;
            sel.appendChild(opt);
        });
    }

    function handleSetupCreate() {
        const name = els['setup-name'].value.trim();
        const username = els['setup-username'].value.trim();
        const pin = els['setup-pin'].value.trim();
        const pin2 = els['setup-pin-confirm'].value.trim();

        if (!name || !username || !pin || !pin2) {
            return showToast('Setup', 'Please fill all fields.', 'error');
        }
        if (pin !== pin2) {
            return showToast('Setup', 'PIN mismatch. Please confirm again.', 'error');
        }
        if (!/^\d{4,6}$/.test(pin)) {
            return showToast('Setup', 'PIN must be 4–6 digits.', 'error');
        }

        const userId = 'u' + (db.users.length + 1);
        db.users.push({
            id: userId,
            name,
            username,
            pin,
            role: ROLE_SUPERADMIN,
            createdAt: new Date().toISOString()
        });
        saveDb();

        currentUser = db.users.find(u => u.id === userId);
        saveSession({ userId: currentUser.id, loggedInAt: new Date().toISOString() });

        showToast('Setup complete', 'Superadmin created and logged in.', 'success');
        showMainScreen();
        loadShopIntoHeader();
        applyRoleUI();
        startNewSale();
        refreshAllViews();
    }

    function handleLogin() {
        const userId = els['login-user'].value;
        const pin = els['login-pin'].value.trim();
        const user = db.users.find(u => u.id === userId);
        if (!user) return showToast('Login', 'User not found.', 'error');

        if (user.pin !== pin) {
            return showToast('Login', 'Incorrect PIN.', 'error');
        }

        currentUser = user;
        saveSession({ userId: user.id, loggedInAt: new Date().toISOString() });

        showToast('Welcome', `Signed in as ${user.name}`, 'success');
        els['login-pin'].value = '';
        showMainScreen();
        loadShopIntoHeader();
        applyRoleUI();
        startNewSale();
        refreshAllViews();
    }

    function handleLogout() {
        currentUser = null;
        saveSession(null);
        showToast('Logout', 'You have been signed out.', 'success');
        showLoginOnly();
    }

    function loadShopIntoHeader() {
        els['header-shop-name'].textContent = db.shop.name || 'LitePOS';
        els['header-shop-address'].textContent = db.shop.address || '';
        els['header-shop-phone'].textContent = db.shop.phone || '';
        if (currentUser) {
            els['header-user-label'].textContent = currentUser.name;
            els['header-user-role'].textContent = currentUser.role === ROLE_SUPERADMIN ? 'Superadmin' : 'Sales';
        } else {
            els['header-user-label'].textContent = 'Not signed in';
            els['header-user-role'].textContent = '';
        }
    }

    function applyRoleUI() {
        const isSuperadmin = currentUser && currentUser.role === ROLE_SUPERADMIN;
        els.navAdminButtons.forEach(btn => {
            btn.style.display = isSuperadmin ? 'flex' : 'none';
        });
        if (!isSuperadmin) {
            // If currently on Admin, switch to POS
            switchTab('tab-sale');
        }
    }

    // -------------------------
    // GLOBAL HANDLERS
    // -------------------------

    function attachGlobalHandlers() {
        // Setup / login
        if (els['btn-setup-create']) {
            els['btn-setup-create'].addEventListener('click', handleSetupCreate);
        }
        if (els['btn-login']) {
            els['btn-login'].addEventListener('click', handleLogin);
        }
        if (els['btn-logout']) {
            els['btn-logout'].addEventListener('click', handleLogout);
        }

        // Enter key on login PIN
        if (els['login-pin']) {
            els['login-pin'].addEventListener('keydown', ev => {
                if (ev.key === 'Enter') handleLogin();
            });
        }

        // Tabs
        els.navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                if (tabId === 'tab-admin' && (!currentUser || currentUser.role !== ROLE_SUPERADMIN)) {
                    return showToast('Permission', 'Only Superadmin can access Admin.', 'error');
                }
                switchTab(tabId);
            });
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', handleKeyShortcuts);

        // POS: customer & quick add
        if (els['btn-search-customer']) {
            els['btn-search-customer'].addEventListener('click', findCustomerFromInput);
        }
        if (els['sale-customer-phone']) {
            els['sale-customer-phone'].addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    findCustomerFromInput();
                }
            });
        }
        if (els['btn-save-quick-customer']) {
            els['btn-save-quick-customer'].addEventListener('click', saveQuickCustomer);
        }
        if (els['btn-clear-customer']) {
            els['btn-clear-customer'].addEventListener('click', () => {
                setCurrentCustomer(null);
            });
        }

        // POS: product search
        if (els['product-search']) {
            els['product-search'].addEventListener('input', renderProductSearchTable);
        }

        // POS: discount / payment inputs
        if (els['input-discount']) {
            els['input-discount'].addEventListener('input', () => {
                if (!currentSale) return;
                currentSale.discount = parseMoneyInput(els['input-discount'].value);
                clampDiscount();
                updateSaleTotals();
            });
        }
        if (els['input-payment']) {
            els['input-payment'].addEventListener('input', () => {
                if (!currentSale) return;
                currentSale.payment = parseMoneyInput(els['input-payment'].value);
                updateSaleTotals();
            });
        }

        // POS: sale controls
        if (els['btn-new-sale']) {
            els['btn-new-sale'].addEventListener('click', () => startNewSale(true));
        }
        if (els['btn-hold-sale']) {
            els['btn-hold-sale'].addEventListener('click', holdCurrentSale);
        }
        if (els['btn-cancel-sale']) {
            els['btn-cancel-sale'].addEventListener('click', cancelCurrentSale);
        }
        if (els['btn-clear-cart']) {
            els['btn-clear-cart'].addEventListener('click', clearCart);
        }
        if (els['btn-complete-sale']) {
            els['btn-complete-sale'].addEventListener('click', completeCurrentSale);
        }

        // POS: print last receipt
        if (els['btn-print-last-receipt']) {
            els['btn-print-last-receipt'].addEventListener('click', printLastReceipt);
        }

        // Customers tab
        if (els['customer-search']) {
            els['customer-search'].addEventListener('input', renderCustomersTable);
        }
        if (els['btn-save-customer-edit']) {
            els['btn-save-customer-edit'].addEventListener('click', saveCustomerFromForm);
        }
        if (els['btn-new-customer']) {
            els['btn-new-customer'].addEventListener('click', clearCustomerForm);
        }

        // Products tab
        if (els['product-manage-search']) {
            els['product-manage-search'].addEventListener('input', renderProductsTable);
        }
        if (els['btn-save-product']) {
            els['btn-save-product'].addEventListener('click', saveProductFromForm);
        }
        if (els['btn-new-product']) {
            els['btn-new-product'].addEventListener('click', clearProductForm);
        }

        // Sales tab
        ['sales-filter-from', 'sales-filter-to', 'sales-filter-status', 'sales-filter-user', 'sales-filter-query']
            .forEach(id => {
                if (els[id]) {
                    els[id].addEventListener('input', renderSalesTable);
                    els[id].addEventListener('change', renderSalesTable);
                }
            });
        if (els['btn-sales-clear-filters']) {
            els['btn-sales-clear-filters'].addEventListener('click', clearSalesFilters);
        }

        // Reports
        if (els['btn-export-csv']) {
            els['btn-export-csv'].addEventListener('click', exportCsvReport);
        }
        if (els['btn-print-report']) {
            els['btn-print-report'].addEventListener('click', printReport);
        }

        // Admin: shop settings
        if (els['btn-save-shop-settings']) {
            els['btn-save-shop-settings'].addEventListener('click', saveShopSettingsFromForm);
        }

        // Admin: users
        if (els['btn-save-user']) {
            els['btn-save-user'].addEventListener('click', saveUserFromForm);
        }
        if (els['btn-new-user']) {
            els['btn-new-user'].addEventListener('click', clearUserForm);
        }

        // Admin: backup/restore
        if (els['btn-backup-download']) {
            els['btn-backup-download'].addEventListener('click', downloadBackup);
        }
        if (els['backup-file-input']) {
            els['backup-file-input'].addEventListener('change', handleRestoreFile);
        }

        // Clean up print classes after printing
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('print-receipt', 'print-report', 'receipt-a4', 'receipt-80mm', 'receipt-58mm');
        });
    }

    function handleKeyShortcuts(ev) {
        const inLogin = !els['main-screen'].classList.contains('hidden');

        if (!inLogin && ev.altKey) {
            // Tabs Alt+1..6
            switch (ev.key) {
                case '1': switchTab('tab-sale'); break;
                case '2': switchTab('tab-customers'); break;
                case '3': switchTab('tab-products'); break;
                case '4': switchTab('tab-sales'); break;
                case '5': switchTab('tab-reports'); break;
                case '6':
                    if (currentUser && currentUser.role === ROLE_SUPERADMIN) {
                        switchTab('tab-admin');
                    }
                    break;
                case 'f':
                case 'F':
                    focusCustomerPhone();
                    break;
                case 'p':
                case 'P':
                    focusProductSearch();
                    break;
                case 'n':
                case 'N':
                    startNewSale(true);
                    break;
                case 'h':
                case 'H':
                    holdCurrentSale();
                    break;
                case 'c':
                case 'C':
                    completeCurrentSale();
                    break;
                case 'r':
                case 'R':
                    printLastReceipt();
                    break;
            }
        }

        // Esc: blur active element
        if (ev.key === 'Escape') {
            if (document.activeElement && document.activeElement.blur) {
                document.activeElement.blur();
            }
        }
    }

    function switchTab(tabId) {
        els.navButtons.forEach(btn => {
            const tab = btn.getAttribute('data-tab');
            if (tab === tabId) {
                btn.classList.add('nav-btn-active');
            } else {
                btn.classList.remove('nav-btn-active');
            }
        });

        const tabIds = ['tab-sale', 'tab-customers', 'tab-products', 'tab-sales', 'tab-reports', 'tab-admin'];
        tabIds.forEach(id => {
            if (els[id]) {
                if (id === tabId) els[id].classList.remove('hidden');
                else els[id].classList.add('hidden');
            }
        });

        // Refresh specific views when switching
        switch (tabId) {
            case 'tab-sale':
                renderProductSearchTable();
                renderOpenSalesStrip();
                updateSaleTotals();
                break;
            case 'tab-customers':
                renderCustomersTable();
                break;
            case 'tab-products':
                renderProductsTable();
                break;
            case 'tab-sales':
                prepareSalesFiltersIfEmpty();
                renderSalesTable();
                break;
            case 'tab-reports':
                refreshKpis();
                drawSalesChart();
                break;
            case 'tab-admin':
                loadShopForm();
                renderUsersTable();
                populateSalespersonFilter();
                break;
        }
    }

    // -------------------------
    // POS: CUSTOMER
    // -------------------------

    function findCustomerFromInput() {
        const phone = (els['sale-customer-phone'].value || '').trim();
        if (!phone) {
            setCurrentCustomer(null);
            showToast('Customer search', 'Please enter phone number.', 'error');
            return;
        }
        const customer = db.customers.find(c => c.phone === phone);
        if (customer) {
            setCurrentCustomer(customer);
            els['sale-customer-name'].value = customer.name;
            showToast('Customer found', customer.name, 'success');
        } else {
            setCurrentCustomer({
                id: null,
                name: '',
                phone,
                notes: '',
                lastSaleAt: null,
                lastSaleTotal: 0
            });
            els['sale-customer-name'].value = '';
            showToast('New customer', 'Not found, you can quick-add.', 'success');
        }
    }

    function setCurrentCustomer(customer) {
        if (!currentSale) currentSale = createEmptySale();
        currentSale.customer = customer || null;

        if (!customer) {
            els['summary-customer-name'].textContent = 'Not selected';
            els['summary-customer-meta'].textContent = 'Phone · —';
            els['summary-customer-status'].textContent = 'Status · New';
            els['sale-customer-phone'].value = '';
            els['sale-customer-name'].value = '';
        } else {
            els['summary-customer-name'].textContent = customer.name || 'Walk-in';
            els['summary-customer-meta'].textContent = `Phone · ${customer.phone || '—'}`;
            els['summary-customer-status'].textContent = customer.id ? 'Status · Existing' : 'Status · New';
            els['sale-customer-phone'].value = customer.phone || '';
            els['sale-customer-name'].value = customer.name || '';
        }
    }

    function saveQuickCustomer() {
        const phone = (els['sale-customer-phone'].value || '').trim();
        if (!phone) {
            return showToast('Quick add', 'Enter phone number first.', 'error');
        }
        const name = (els['quick-customer-name'].value || '').trim() ||
            (els['sale-customer-name'].value || '').trim() || 'Customer';
        const notes = (els['quick-customer-notes'].value || '').trim();

        let existing = db.customers.find(c => c.phone === phone);
        if (existing) {
            existing.name = name;
            existing.notes = notes;
        } else {
            existing = {
                id: 'c' + (db.customers.length + 1),
                name,
                phone,
                notes,
                lastSaleAt: null,
                lastSaleTotal: 0
            };
            db.customers.push(existing);
        }
        saveDb();
        setCurrentCustomer(existing);
        els['quick-customer-name'].value = '';
        els['quick-customer-notes'].value = '';
        showToast('Customer saved', `${existing.name} (${existing.phone || 'no phone'})`, 'success');
        renderCustomersTable();
    }

    function focusCustomerPhone() {
        if (els['sale-customer-phone']) {
            els['sale-customer-phone'].focus();
            els['sale-customer-phone'].select();
        }
    }

    // -------------------------
    // POS: SALE OBJECT & CART
    // -------------------------

    function createEmptySale() {
        return {
            id: null,
            status: 'new',  // 'new' | 'open' | 'closed'
            items: [],
            discount: 0,
            payment: 0,
            subtotal: 0,
            total: 0,
            change: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customer: null,  // {id, name, phone, ...} or null
            salespersonId: currentUser ? currentUser.id : null
        };
    }

    function startNewSale(notify) {
        currentSale = createEmptySale();
        setCurrentCustomer(null);
        els['input-discount'].value = '0';
        els['input-payment'].value = '0';
        els['cart-table-body'].innerHTML = '';
        els['summary-sale-status'].textContent = 'New';
        renderOpenSalesStrip();
        updateSaleTotals();
        if (notify) showToast('New sale', 'Started a new sale.', 'success');
        focusCustomerPhone();
    }

    function clearCart() {
        if (!currentSale) return;
        currentSale.items = [];
        updateSaleTotals();
        renderCartTable();
    }

    function clampDiscount() {
        if (!currentSale) return;
        const subtotal = currentSale.subtotal || 0;
        if (currentSale.discount > subtotal) {
            currentSale.discount = subtotal;
            els['input-discount'].value = String(subtotal);
        }
        if (currentSale.discount < 0) {
            currentSale.discount = 0;
            els['input-discount'].value = '0';
        }
    }

    function updateSaleTotals() {
        if (!currentSale) return;
        let subtotal = 0;
        currentSale.items.forEach(it => {
            subtotal += it.qty * it.price;
        });
        currentSale.subtotal = subtotal;
        clampDiscount();
        currentSale.total = Math.max(0, subtotal - (currentSale.discount || 0));
        currentSale.change = Math.max(0, (currentSale.payment || 0) - currentSale.total);
        currentSale.updatedAt = new Date().toISOString();

        els['summary-subtotal'].textContent = formatMoney(subtotal);
        els['summary-total'].textContent = formatMoney(currentSale.total);
        els['summary-items-count'].textContent = String(currentSale.items.reduce((s, it) => s + it.qty, 0));
        els['summary-change'].textContent = formatMoney(currentSale.change);
        els['input-discount'].value = currentSale.discount || 0;
        els['input-payment'].value = currentSale.payment || 0;
    }

    function renderCartTable() {
        const tbody = els['cart-table-body'];
        tbody.innerHTML = '';
        if (!currentSale) return;

        currentSale.items.forEach((item, index) => {
            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            tdName.textContent = item.name;
            tr.appendChild(tdName);

            const tdQty = document.createElement('td');
            const qtyControls = document.createElement('div');
            qtyControls.style.display = 'flex';
            qtyControls.style.alignItems = 'center';
            qtyControls.style.gap = '4px';

            const btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.className = 'btn btn-ghost btn-lg';
            btnMinus.textContent = '−';
            btnMinus.style.padding = '2px 8px';
            btnMinus.addEventListener('click', () => changeCartQty(index, -1));

            const spanQty = document.createElement('span');
            spanQty.textContent = String(item.qty);
            spanQty.style.minWidth = '18px';
            spanQty.style.textAlign = 'center';

            const btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.className = 'btn btn-ghost btn-lg';
            btnPlus.textContent = '+';
            btnPlus.style.padding = '2px 8px';
            btnPlus.addEventListener('click', () => changeCartQty(index, 1));

            qtyControls.appendChild(btnMinus);
            qtyControls.appendChild(spanQty);
            qtyControls.appendChild(btnPlus);
            tdQty.appendChild(qtyControls);
            tr.appendChild(tdQty);

            const tdPrice = document.createElement('td');
            tdPrice.textContent = formatMoney(item.price);
            tr.appendChild(tdPrice);

            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatMoney(item.qty * item.price);
            tr.appendChild(tdTotal);

            const tdActions = document.createElement('td');
            const btnRemove = document.createElement('button');
            btnRemove.type = 'button';
            btnRemove.className = 'btn btn-ghost btn-lg';
            btnRemove.textContent = '✕';
            btnRemove.addEventListener('click', () => removeCartItem(index));
            tdActions.appendChild(btnRemove);
            tr.appendChild(tdActions);

            tbody.appendChild(tr);
        });

        updateSaleTotals();
    }

    function changeCartQty(index, delta) {
        if (!currentSale || !currentSale.items[index]) return;
        const item = currentSale.items[index];
        const newQty = item.qty + delta;
        if (newQty <= 0) {
            removeCartItem(index);
            return;
        }
        const product = db.products.find(p => p.sku === item.sku);
        if (product && newQty > product.stock) {
            return showToast('Stock limit', `Only ${product.stock} in stock.`, 'error');
        }
        item.qty = newQty;
        renderCartTable();
    }

    function removeCartItem(index) {
        if (!currentSale || !currentSale.items[index]) return;
        currentSale.items.splice(index, 1);
        renderCartTable();
    }

    function addProductToCart(sku) {
        if (!currentSale) currentSale = createEmptySale();
        const product = db.products.find(p => p.sku === sku);
        if (!product) return;

        const existing = currentSale.items.find(it => it.sku === sku);
        const currentQty = existing ? existing.qty : 0;
        if (currentQty + 1 > product.stock) {
            return showToast('Stock limit', `Only ${product.stock} in stock.`, 'error');
        }

        if (existing) {
            existing.qty += 1;
        } else {
            currentSale.items.push({
                sku: product.sku,
                name: product.name,
                qty: 1,
                price: product.sellPrice,
                buyPrice: product.buyPrice
            });
        }
        renderCartTable();
    }

    // -------------------------
    // POS: PRODUCT SEARCH TABLE
    // -------------------------

    function renderProductSearchTable() {
        const tbody = els['product-table-body'];
        tbody.innerHTML = '';
        const query = (els['product-search'].value || '').trim().toLowerCase();

        const products = db.products || [];
        const filtered = products.filter(p => {
            if (!query) return true;
            const text = (p.name + ' ' + p.sku).toLowerCase();
            return text.includes(query);
        });

        filtered.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.addEventListener('click', () => addProductToCart(p.sku));

            const tdName = document.createElement('td');
            tdName.textContent = p.name;
            tr.appendChild(tdName);

            const tdSku = document.createElement('td');
            tdSku.textContent = p.sku;
            tr.appendChild(tdSku);

            const tdSell = document.createElement('td');
            tdSell.textContent = formatMoney(p.sellPrice);
            tr.appendChild(tdSell);

            const tdStock = document.createElement('td');
            tdStock.textContent = String(p.stock);
            if (p.stock <= (p.lowStockAt || 0)) {
                tdStock.style.color = '#facc15';
            }
            tr.appendChild(tdStock);

            const tdBtn = document.createElement('td');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary btn-lg';
            btn.textContent = 'Add';
            btn.addEventListener('click', ev => {
                ev.stopPropagation();
                addProductToCart(p.sku);
            });
            tdBtn.appendChild(btn);
            tr.appendChild(tdBtn);

            tbody.appendChild(tr);

            // Auto focus first row for Enter
            if (idx === 0) {
                // not a real focus, just visual
            }
        });
    }

    function focusProductSearch() {
        if (els['product-search']) {
            els['product-search'].focus();
            els['product-search'].select();
        }
    }

    // -------------------------
    // POS: OPEN / HOLD / CANCEL / COMPLETE
    // -------------------------

    function holdCurrentSale() {
        if (!currentSale || currentSale.items.length === 0) {
            return showToast('Hold sale', 'Cart is empty.', 'error');
        }
        currentSale.status = 'open';
        currentSale.updatedAt = new Date().toISOString();
        const now = new Date().toISOString();

        if (!currentSale.id) {
            const newId = 'S' + String(db.counters.nextSaleId++).padStart(4, '0');
            currentSale.id = newId;
            currentSale.createdAt = now;
            db.sales.push(structuredCloneSale(currentSale));
        } else {
            const idx = db.sales.findIndex(s => s.id === currentSale.id);
            if (idx !== -1) {
                db.sales[idx] = structuredCloneSale(currentSale);
            } else {
                db.sales.push(structuredCloneSale(currentSale));
            }
        }
        saveDb();
        renderOpenSalesStrip();
        showToast('Sale held', `Sale ${currentSale.id} saved as open.`, 'success');
        els['summary-sale-status'].textContent = `Open · ${currentSale.id}`;
    }

    function cancelCurrentSale() {
        if (!currentSale || !currentSale.id) {
            startNewSale();
            showToast('Sale cleared', 'Cancelled unsaved sale.', 'success');
            return;
        }
        const idx = db.sales.findIndex(s => s.id === currentSale.id && s.status === 'open');
        if (idx === -1) {
            startNewSale();
            return;
        }
        if (!confirm(`Cancel open sale ${currentSale.id}? It will be removed.`)) return;
        db.sales.splice(idx, 1);
        saveDb();
        startNewSale();
        renderOpenSalesStrip();
        showToast('Sale cancelled', 'Open sale removed.', 'success');
    }

    function completeCurrentSale() {
        if (!currentSale || currentSale.items.length === 0) {
            return showToast('Complete sale', 'Cart is empty.', 'error');
        }
        if (!currentSale.customer) {
            // Auto attach default walk-in
            const walkIn = db.customers.find(c => c.phone === '') || db.customers[0];
            setCurrentCustomer(walkIn || null);
        }
        updateSaleTotals();

        if (currentSale.total <= 0) {
            return showToast('Complete sale', 'Total must be greater than 0.', 'error');
        }
        if ((currentSale.payment || 0) < currentSale.total) {
            return showToast('Payment insufficient', 'Payment must cover total.', 'error');
        }

        const now = new Date().toISOString();
        currentSale.status = 'closed';
        currentSale.updatedAt = now;
        if (!currentSale.createdAt) currentSale.createdAt = now;

        // Ensure sale has ID
        if (!currentSale.id) {
            const newId = 'S' + String(db.counters.nextSaleId++).padStart(4, '0');
            currentSale.id = newId;
        }

        // Deduct stock
        currentSale.items.forEach(it => {
            const product = db.products.find(p => p.sku === it.sku);
            if (product) {
                product.stock = Math.max(0, (product.stock || 0) - it.qty);
            }
        });

        // Persist sale
        const idx = db.sales.findIndex(s => s.id === currentSale.id);
        const saleCopy = structuredCloneSale(currentSale);
        db.sales[idx === -1 ? db.sales.length : idx] = saleCopy;

        // Update customer stats
        if (currentSale.customer && currentSale.customer.phone != null) {
            let customer = db.customers.find(c => c.phone === currentSale.customer.phone);
            if (!customer) {
                customer = {
                    id: 'c' + (db.customers.length + 1),
                    name: currentSale.customer.name || 'Customer',
                    phone: currentSale.customer.phone,
                    notes: currentSale.customer.notes || '',
                    lastSaleAt: null,
                    lastSaleTotal: 0
                };
                db.customers.push(customer);
            } else {
                // update name if changed
                if (currentSale.customer.name) {
                    customer.name = currentSale.customer.name;
                }
            }
            customer.lastSaleAt = now;
            customer.lastSaleTotal = currentSale.total;
        }

        saveDb();
        lastClosedSaleId = currentSale.id;
        els['summary-sale-status'].textContent = `Closed · ${currentSale.id}`;
        showToast('Sale completed', `Sale ${currentSale.id} closed.`, 'success');

        // Update UI bits
        renderCartTable();
        renderOpenSalesStrip();
        renderProductsTable();
        renderCustomersTable();
        refreshKpis();
        renderSalesTable();

        // Fill receipt preview
        fillReceiptFromSale(saleCopy);

        // Prepare for next sale
        startNewSale();
        renderTodaySnapshot();
    }

    function structuredCloneSale(s) {
        return JSON.parse(JSON.stringify(s));
    }

    function renderOpenSalesStrip() {
        const container = els['open-sales-list'];
        container.innerHTML = '';
        const openSales = db.sales.filter(s => s.status === 'open');
        openSales.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        openSales.forEach(sale => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'open-sale-pill';

            const dot = document.createElement('span');
            dot.className = 'dot';
            pill.appendChild(dot);

            const text = document.createElement('span');
            text.textContent = sale.id;
            pill.appendChild(text);

            const meta = document.createElement('span');
            meta.className = 'meta';
            const customerName = sale.customer && sale.customer.name
                ? sale.customer.name
                : 'Walk-in';
            meta.textContent = `${customerName} · ${formatMoney(sale.total || 0)}`;
            pill.appendChild(meta);

            pill.addEventListener('click', () => loadOpenSale(sale.id));

            container.appendChild(pill);
        });
    }

    function loadOpenSale(saleId) {
        const sale = db.sales.find(s => s.id === saleId && s.status === 'open');
        if (!sale) return;
        currentSale = structuredCloneSale(sale);
        els['summary-sale-status'].textContent = `Open · ${sale.id}`;
        setCurrentCustomer(sale.customer || null);
        renderCartTable();
        updateSaleTotals();
        switchTab('tab-sale');
        showToast('Open sale', `Loaded ${sale.id} from open sales.`, 'success');
    }

    // -------------------------
    // POS: RECEIPT
    // -------------------------

    function fillReceiptFromSale(sale) {
        els['receipt-shop-name'].textContent = db.shop.name || 'Shop';
        els['receipt-shop-address'].textContent = db.shop.address || '';
        els['receipt-shop-phone'].textContent = db.shop.phone || '';

        const customerName = sale.customer && sale.customer.name
            ? sale.customer.name
            : 'Walk-in';
        const customerPhone = sale.customer && sale.customer.phone
            ? sale.customer.phone
            : '—';
        const dt = new Date(sale.createdAt || new Date());
        const metaText = [
            `Invoice: ${sale.id}`,
            `Date: ${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            `Customer: ${customerName}`,
            `Phone: ${customerPhone}`
        ].join(' | ');
        els['receipt-sale-meta'].textContent = metaText;

        const tbody = els['receipt-items-body'];
        tbody.innerHTML = '';
        sale.items.forEach(it => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = it.name;
            const tdQty = document.createElement('td');
            tdQty.textContent = String(it.qty);
            const tdPrice = document.createElement('td');
            tdPrice.textContent = formatMoney(it.price);
            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatMoney(it.qty * it.price);
            tr.appendChild(tdName);
            tr.appendChild(tdQty);
            tr.appendChild(tdPrice);
            tr.appendChild(tdTotal);
            tbody.appendChild(tr);
        });

        els['receipt-subtotal'].textContent = formatMoney(sale.subtotal || 0);
        els['receipt-discount'].textContent = formatMoney(sale.discount || 0);
        els['receipt-total'].textContent = formatMoney(sale.total || 0);
        els['receipt-payment'].textContent = formatMoney(sale.payment || 0);
        els['receipt-change'].textContent = formatMoney(sale.change || 0);
    }

    function printLastReceipt() {
        if (!lastClosedSaleId) {
            const latest = db.sales.filter(s => s.status === 'closed').slice(-1)[0];
            if (!latest) {
                return showToast('Print', 'No closed sale to print.', 'error');
            }
            lastClosedSaleId = latest.id;
        }

        const sale = db.sales.find(s => s.id === lastClosedSaleId);
        if (!sale) {
            return showToast('Print', 'Last sale not found.', 'error');
        }

        fillReceiptFromSale(sale);

        const size = els['receipt-size'].value || 'a4';
        document.body.classList.add('print-receipt');
        document.body.classList.add(
            size === '80mm' ? 'receipt-80mm' :
                size === '58mm' ? 'receipt-58mm' : 'receipt-a4'
        );

        window.print();

        // Cleanup (in case afterprint doesn’t fire)
        setTimeout(() => {
            document.body.classList.remove('print-receipt', 'receipt-a4', 'receipt-80mm', 'receipt-58mm');
        }, 500);
    }

    // -------------------------
    // CUSTOMERS TAB
    // -------------------------

    function renderCustomersTable() {
        const tbody = els['customers-table-body'];
        tbody.innerHTML = '';
        const query = (els['customer-search'].value || '').trim().toLowerCase();
        const customers = db.customers || [];

        customers
            .slice()
            .sort((a, b) => (b.lastSaleAt || '').localeCompare(a.lastSaleAt || ''))
            .forEach(c => {
                if (query) {
                    const text = (c.name + ' ' + c.phone + ' ' + (c.notes || '')).toLowerCase();
                    if (!text.includes(query)) return;
                }

                const tr = document.createElement('tr');
                tr.addEventListener('click', () => loadCustomerToForm(c.id));

                const tdName = document.createElement('td');
                tdName.textContent = c.name;
                tr.appendChild(tdName);

                const tdPhone = document.createElement('td');
                tdPhone.textContent = c.phone || '—';
                tdPhone.style.textAlign = 'center';
                tr.appendChild(tdPhone);

                const tdNotes = document.createElement('td');
                tdNotes.textContent = c.notes || '';
                tr.appendChild(tdNotes);

                const tdLast = document.createElement('td');
                if (c.lastSaleAt) {
                    const d = new Date(c.lastSaleAt);
                    tdLast.textContent = `${d.toLocaleDateString()} · ${formatMoney(c.lastSaleTotal || 0)}`;
                } else {
                    tdLast.textContent = '—';
                }
                tr.appendChild(tdLast);

                tbody.appendChild(tr);
            });
    }

    function loadCustomerToForm(id) {
        const c = db.customers.find(cu => cu.id === id);
        if (!c) return;
        els['customer-edit-name'].value = c.name;
        els['customer-edit-phone'].value = c.phone;
        els['customer-edit-notes'].value = c.notes || '';
        els['customer-edit-name'].dataset.customerId = c.id;
    }

    function clearCustomerForm() {
        els['customer-edit-name'].value = '';
        els['customer-edit-phone'].value = '';
        els['customer-edit-notes'].value = '';
        delete els['customer-edit-name'].dataset.customerId;
    }

    function saveCustomerFromForm() {
        const name = els['customer-edit-name'].value.trim();
        const phone = (els['customer-edit-phone'].value || '').trim();
        const notes = (els['customer-edit-notes'].value || '').trim();
        if (!name) return showToast('Customer', 'Name is required.', 'error');

        const existingId = els['customer-edit-name'].dataset.customerId;
        let customer;
        if (existingId) {
            customer = db.customers.find(c => c.id === existingId);
        }

        // Unique phone check
        if (phone) {
            const dup = db.customers.find(c => c.phone === phone && c.id !== existingId);
            if (dup) {
                return showToast('Customer', 'Another customer already uses this phone.', 'error');
            }
        }

        if (customer) {
            customer.name = name;
            customer.phone = phone;
            customer.notes = notes;
        } else {
            customer = {
                id: 'c' + (db.customers.length + 1),
                name,
                phone,
                notes,
                lastSaleAt: null,
                lastSaleTotal: 0
            };
            db.customers.push(customer);
        }
        saveDb();
        renderCustomersTable();
        showToast('Customer saved', `${customer.name}`, 'success');
    }

    // -------------------------
    // PRODUCTS TAB
    // -------------------------

    function renderProductsTable() {
        const tbody = els['products-table-body'];
        tbody.innerHTML = '';
        const query = (els['product-manage-search'].value || '').trim().toLowerCase();

        db.products
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach(p => {
                if (query) {
                    const txt = (p.name + ' ' + p.sku).toLowerCase();
                    if (!txt.includes(query)) return;
                }

                const tr = document.createElement('tr');
                if (p.stock <= (p.lowStockAt || 0)) {
                    tr.classList.add('low-stock-row');
                }
                tr.addEventListener('click', () => loadProductToForm(p.id));

                const tdName = document.createElement('td');
                tdName.textContent = p.name;
                tr.appendChild(tdName);

                const tdSku = document.createElement('td');
                tdSku.textContent = p.sku;
                tr.appendChild(tdSku);

                const tdBuy = document.createElement('td');
                tdBuy.textContent = formatMoney(p.buyPrice);
                tr.appendChild(tdBuy);

                const tdSell = document.createElement('td');
                tdSell.textContent = formatMoney(p.sellPrice);
                tr.appendChild(tdSell);

                const tdStock = document.createElement('td');
                tdStock.textContent = String(p.stock);
                tr.appendChild(tdStock);

                const tdLow = document.createElement('td');
                tdLow.textContent = p.stock <= (p.lowStockAt || 0) ? 'Yes' : '';
                tr.appendChild(tdLow);

                tbody.appendChild(tr);
            });
    }

    function loadProductToForm(id) {
        const p = db.products.find(p => p.id === id);
        if (!p) return;
        els['product-edit-name'].value = p.name;
        els['product-edit-sku'].value = p.sku;
        els['product-edit-buy'].value = p.buyPrice;
        els['product-edit-sell'].value = p.sellPrice;
        els['product-edit-stock'].value = p.stock;
        els['product-edit-low'].value = p.lowStockAt || 0;
        els['product-edit-name'].dataset.productId = p.id;
    }

    function clearProductForm() {
        els['product-edit-name'].value = '';
        els['product-edit-sku'].value = '';
        els['product-edit-buy'].value = '';
        els['product-edit-sell'].value = '';
        els['product-edit-stock'].value = '';
        els['product-edit-low'].value = '';
        delete els['product-edit-name'].dataset.productId;
    }

    function saveProductFromForm() {
        const name = els['product-edit-name'].value.trim();
        const sku = els['product-edit-sku'].value.trim();
        const buy = parseMoneyInput(els['product-edit-buy'].value);
        const sell = parseMoneyInput(els['product-edit-sell'].value);
        const stock = parseInt(els['product-edit-stock'].value || '0', 10);
        const low = parseInt(els['product-edit-low'].value || '0', 10);

        if (!name || !sku) {
            return showToast('Product', 'Name & SKU are required.', 'error');
        }
        if (sell < buy) {
            showToast('Warning', 'Selling price is below buying price.', 'error');
        }

        const existingId = els['product-edit-name'].dataset.productId;
        let product;
        if (existingId) {
            product = db.products.find(p => p.id === existingId);
        }

        // Unique SKU
        const dup = db.products.find(p => p.sku === sku && p.id !== existingId);
        if (dup) {
            return showToast('Product', 'Another product already uses this SKU.', 'error');
        }

        if (product) {
            product.name = name;
            product.sku = sku;
            product.buyPrice = buy;
            product.sellPrice = sell;
            product.stock = stock;
            product.lowStockAt = low;
        } else {
            product = {
                id: 'p' + (db.products.length + 1),
                name,
                sku,
                buyPrice: buy,
                sellPrice: sell,
                stock,
                lowStockAt: low,
                createdAt: new Date().toISOString()
            };
            db.products.push(product);
        }

        saveDb();
        renderProductsTable();
        renderProductSearchTable();
        showToast('Product saved', `${product.name}`, 'success');
    }

    // -------------------------
    // SALES TAB
    // -------------------------

    function prepareSalesFiltersIfEmpty() {
        const today = new Date();
        if (!els['sales-filter-from'].value) {
            const weekAgo = new Date(today.getTime() - 6 * 86400000);
            els['sales-filter-from'].value = toDateInput(weekAgo);
        }
        if (!els['sales-filter-to'].value) {
            els['sales-filter-to'].value = toDateInput(today);
        }
        populateSalespersonFilter();
    }

    function populateSalespersonFilter() {
        const sel = els['sales-filter-user'];
        if (!sel) return;
        const prev = sel.value || 'all';
        sel.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = 'All';
        sel.appendChild(optAll);

        db.users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.role === ROLE_SUPERADMIN ? 'Superadmin' : 'Sales'})`;
            sel.appendChild(opt);
        });
        sel.value = prev;
    }

    function clearSalesFilters() {
        els['sales-filter-from'].value = '';
        els['sales-filter-to'].value = '';
        els['sales-filter-status'].value = 'all';
        els['sales-filter-user'].value = 'all';
        els['sales-filter-query'].value = '';
        renderSalesTable();
    }

    function renderSalesTable() {
        const tbody = els['sales-table-body'];
        tbody.innerHTML = '';

        const from = els['sales-filter-from'].value;
        const to = els['sales-filter-to'].value;
        const status = els['sales-filter-status'].value;
        const userId = els['sales-filter-user'].value;
        const query = (els['sales-filter-query'].value || '').trim().toLowerCase();

        db.sales
            .slice()
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .forEach(sale => {
                // Date filter
                if (from || to) {
                    const d = new Date(sale.createdAt || sale.updatedAt || new Date());
                    const dStr = toDateInput(d);
                    if (from && dStr < from) return;
                    if (to && dStr > to) return;
                }

                if (status !== 'all' && sale.status !== status) return;
                if (userId && userId !== 'all' && sale.salespersonId !== userId) return;

                if (query) {
                    const customerName = sale.customer && sale.customer.name ? sale.customer.name : '';
                    const phone = sale.customer && sale.customer.phone ? sale.customer.phone : '';
                    const text = (sale.id + ' ' + customerName + ' ' + phone).toLowerCase();
                    if (!text.includes(query)) return;
                }

                const tr = document.createElement('tr');

                const tdDate = document.createElement('td');
                const d = new Date(sale.createdAt || sale.updatedAt || new Date());
                tdDate.textContent = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                tr.appendChild(tdDate);

                const tdCustomer = document.createElement('td');
                const customerName = sale.customer && sale.customer.name ? sale.customer.name : 'Walk-in';
                tdCustomer.textContent = customerName;
                tr.appendChild(tdCustomer);

                const tdPhone = document.createElement('td');
                tdPhone.textContent = sale.customer && sale.customer.phone ? sale.customer.phone : '—';
                tr.appendChild(tdPhone);

                const tdUser = document.createElement('td');
                const user = db.users.find(u => u.id === sale.salespersonId);
                tdUser.textContent = user ? user.name : '—';
                tr.appendChild(tdUser);

                const tdStatus = document.createElement('td');
                tdStatus.textContent = sale.status;
                tr.appendChild(tdStatus);

                const itemsCount = sale.items.reduce((s, it) => s + it.qty, 0);
                const tdItems = document.createElement('td');
                tdItems.textContent = String(itemsCount);
                tr.appendChild(tdItems);

                const tdTotal = document.createElement('td');
                tdTotal.textContent = formatMoney(sale.total || 0);
                tr.appendChild(tdTotal);

                const tdProfit = document.createElement('td');
                tdProfit.textContent = formatMoney(computeProfitForSale(sale));
                tr.appendChild(tdProfit);

                tbody.appendChild(tr);
            });
    }

    function computeProfitForSale(sale) {
        let gross = 0;
        sale.items.forEach(it => {
            gross += (it.price - (it.buyPrice || 0)) * it.qty;
        });
        // Discount decreases revenue -> subtract from profit
        return gross - (sale.discount || 0);
    }

    // -------------------------
    // REPORTS / KPIs / CHART
    // -------------------------

    function refreshKpis() {
        const closed = db.sales.filter(s => s.status === 'closed');
        let totalValue = 0;
        let totalProfit = 0;
        closed.forEach(s => {
            totalValue += s.total || 0;
            totalProfit += computeProfitForSale(s);
        });

        els['kpi-total-sales'].textContent = formatMoney(totalValue);
        els['kpi-total-sales-count'].textContent = `${closed.length} invoices`;
        els['kpi-total-profit'].textContent = formatMoney(totalProfit);
        els['kpi-profit-margin'].textContent = totalValue > 0
            ? `${((totalProfit / totalValue) * 100).toFixed(1)}% margin`
            : '—';

        const todayStr = toDateInput(new Date());
        let todayValue = 0;
        let todayCount = 0;
        closed.forEach(s => {
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (dStr === todayStr) {
                todayValue += s.total || 0;
                todayCount++;
            }
        });
        els['kpi-today-sales'].textContent = formatMoney(todayValue);
        els['kpi-today-sales-count'].textContent = `${todayCount} invoices`;

        els['kpi-customers-count'].textContent = String(db.customers.length || 0);

        const openCount = db.sales.filter(s => s.status === 'open').length;
        els['kpi-open-sales'].textContent = String(openCount);

        renderTodaySnapshot();
    }

    function renderTodaySnapshot() {
        const closed = db.sales.filter(s => s.status === 'closed');
        const todayStr = toDateInput(new Date());
        let todayValue = 0;
        let todayCount = 0;
        let lastSale = null;
        closed.forEach(s => {
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (dStr === todayStr) {
                todayValue += s.total || 0;
                todayCount++;
                if (!lastSale || (s.createdAt || '').localeCompare(lastSale.createdAt || '') > 0) {
                    lastSale = s;
                }
            }
        });

        els['today-summary-small'].textContent = todayCount
            ? `${todayCount} sale(s) · ${formatMoney(todayValue)}`
            : 'No sales yet today.';
        els['today-salesperson-name'].textContent = currentUser ? currentUser.name : '—';
        if (lastSale) {
            els['today-last-sale'].textContent = `${lastSale.id} · ${formatMoney(lastSale.total || 0)}`;
        } else {
            els['today-last-sale'].textContent = '—';
        }
    }

    function drawSalesChart() {
        const canvas = els['salesChart'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const width = canvas.clientWidth || 400;
        const height = 180;
        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, width, height);

        // Collect last 7 days totals
        const days = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getTime() - i * 86400000);
            days.push(toDateInput(d));
        }

        const totals = days.map(dStr => {
            return db.sales
                .filter(s => s.status === 'closed')
                .filter(s => toDateInput(new Date(s.createdAt || s.updatedAt || new Date())) === dStr)
                .reduce((sum, s) => sum + (s.total || 0), 0);
        });

        const max = Math.max(...totals, 1);

        const paddingLeft = 40;
        const paddingRight = 10;
        const paddingBottom = 20;
        const paddingTop = 10;

        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;

        ctx.font = '11px system-ui, sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.strokeStyle = '#4b5563';

        // Axes
        ctx.beginPath();
        ctx.moveTo(paddingLeft, paddingTop);
        ctx.lineTo(paddingLeft, paddingTop + chartHeight);
        ctx.lineTo(paddingLeft + chartWidth, paddingTop + chartHeight);
        ctx.stroke();

        const barWidth = chartWidth / (days.length * 1.4);
        const gap = barWidth * 0.4;

        totals.forEach((val, idx) => {
            const x = paddingLeft + idx * (barWidth + gap) + gap;
            const heightRatio = val / max;
            const barHeight = chartHeight * heightRatio;
            const y = paddingTop + chartHeight - barHeight;

            // Bar
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(x, y, barWidth, barHeight);

            // Value label
            ctx.fillStyle = '#e5e7eb';
            ctx.textAlign = 'center';
            ctx.fillText(
                val > 0 ? shortMoney(val) : '',
                x + barWidth / 2,
                y - 4
            );

            // Day label
            const label = days[idx].slice(5); // MM-DD
            ctx.fillStyle = '#9ca3af';
            ctx.textAlign = 'center';
            ctx.fillText(label, x + barWidth / 2, paddingTop + chartHeight + 13);
        });
    }

    function exportCsvReport() {
        const from = els['report-from'].value;
        const to = els['report-to'].value;
        const closed = db.sales.filter(s => s.status === 'closed');

        const filtered = closed.filter(s => {
            if (!from && !to) return true;
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (from && dStr < from) return false;
            if (to && dStr > to) return false;
            return true;
        });

        if (!filtered.length) {
            return showToast('Export', 'No closed sales in selected period.', 'error');
        }

        const rows = [];
        rows.push([
            'Invoice',
            'Date',
            'Customer',
            'Phone',
            'Salesperson',
            'Items',
            'Total',
            'Discount',
            'Payment',
            'Change',
            'Profit'
        ]);

        filtered.forEach(s => {
            const d = new Date(s.createdAt || s.updatedAt || new Date());
            const customerName = s.customer && s.customer.name ? s.customer.name : 'Walk-in';
            const phone = s.customer && s.customer.phone ? s.customer.phone : '';
            const user = db.users.find(u => u.id === s.salespersonId);
            const itemsCount = s.items.reduce((sum, it) => sum + it.qty, 0);
            const profit = computeProfitForSale(s);

            rows.push([
                s.id,
                d.toISOString(),
                customerName,
                phone,
                user ? user.name : '',
                String(itemsCount),
                s.total || 0,
                s.discount || 0,
                s.payment || 0,
                s.change || 0,
                profit
            ]);
        });

        const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const todayStr = toDateInput(new Date()).replace(/-/g, '');
        a.download = `litepos-report-${todayStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('Export', 'CSV report downloaded.', 'success');
    }

    function printReport() {
        const from = els['report-from'].value;
        const to = els['report-to'].value;
        const closed = db.sales.filter(s => s.status === 'closed');

        const filtered = closed.filter(s => {
            if (!from && !to) return true;
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (from && dStr < from) return false;
            if (to && dStr > to) return false;
            return true;
        });

        const tbody = els['report-print-body'];
        tbody.innerHTML = '';

        // Aggregate per day
        const byDay = {};
        filtered.forEach(s => {
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (!byDay[dStr]) {
                byDay[dStr] = { invoices: 0, total: 0, profit: 0 };
            }
            byDay[dStr].invoices++;
            byDay[dStr].total += s.total || 0;
            byDay[dStr].profit += computeProfitForSale(s);
        });

        Object.keys(byDay).sort().forEach(day => {
            const row = byDay[day];
            const tr = document.createElement('tr');
            const tdDate = document.createElement('td');
            tdDate.textContent = day;
            const tdInv = document.createElement('td');
            tdInv.textContent = String(row.invoices);
            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatMoney(row.total);
            const tdProfit = document.createElement('td');
            tdProfit.textContent = formatMoney(row.profit);
            tr.appendChild(tdDate);
            tr.appendChild(tdInv);
            tr.appendChild(tdTotal);
            tr.appendChild(tdProfit);
            tbody.appendChild(tr);
        });

        els['report-print-period'].textContent = `Period: ${from || '—'} to ${to || '—'}`;

        document.body.classList.add('print-report');
        window.print();
        setTimeout(() => {
            document.body.classList.remove('print-report');
        }, 500);
    }

    // -------------------------
    // ADMIN: SHOP SETTINGS
    // -------------------------

    function loadShopForm() {
        els['shop-name'].value = db.shop.name || '';
        els['shop-address'].value = db.shop.address || '';
        els['shop-phone'].value = db.shop.phone || '';
    }

    function saveShopSettingsFromForm() {
        db.shop.name = els['shop-name'].value.trim() || 'Shop';
        db.shop.address = els['shop-address'].value.trim();
        db.shop.phone = els['shop-phone'].value.trim();
        saveDb();
        loadShopIntoHeader();
        showToast('Settings saved', 'Shop settings updated.', 'success');
    }

    // -------------------------
    // ADMIN: USERS
    // -------------------------

    function renderUsersTable() {
        const tbody = els['users-table-body'];
        tbody.innerHTML = '';

        db.users.forEach(u => {
            const tr = document.createElement('tr');
            tr.addEventListener('click', () => loadUserToForm(u.id));

            const tdName = document.createElement('td');
            tdName.textContent = u.name;
            tr.appendChild(tdName);

            const tdUsername = document.createElement('td');
            tdUsername.textContent = u.username;
            tr.appendChild(tdUsername);

            const tdRole = document.createElement('td');
            tdRole.textContent = u.role === ROLE_SUPERADMIN ? 'Superadmin' : 'Sales';
            tr.appendChild(tdRole);

            tbody.appendChild(tr);
        });
    }

    function loadUserToForm(id) {
        const u = db.users.find(u => u.id === id);
        if (!u) return;
        els['user-edit-name'].value = u.name;
        els['user-edit-username'].value = u.username;
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = u.role;
        els['user-edit-name'].dataset.userId = u.id;
    }

    function clearUserForm() {
        els['user-edit-name'].value = '';
        els['user-edit-username'].value = '';
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = ROLE_SALES;
        delete els['user-edit-name'].dataset.userId;
    }

    function saveUserFromForm() {
        const name = els['user-edit-name'].value.trim();
        const username = els['user-edit-username'].value.trim();
        const pin = els['user-edit-pin'].value.trim();
        const role = els['user-edit-role'].value;

        if (!name || !username) {
            return showToast('User', 'Name & username are required.', 'error');
        }
        const existingId = els['user-edit-name'].dataset.userId;
        let user;
        if (existingId) {
            user = db.users.find(u => u.id === existingId);
        }

        // Username unique
        const dup = db.users.find(u => u.username === username && u.id !== existingId);
        if (dup) {
            return showToast('User', 'Another user already uses this username.', 'error');
        }

        if (user) {
            const wasSuper = user.role === ROLE_SUPERADMIN;
            user.name = name;
            user.username = username;
            if (pin) {
                if (!/^\d{4,6}$/.test(pin)) {
                    return showToast('User', 'PIN must be 4–6 digits if provided.', 'error');
                }
                user.pin = pin;
            }
            user.role = role;

            if (wasSuper && role !== ROLE_SUPERADMIN) {
                const remainingSuper = db.users.filter(u => u.role === ROLE_SUPERADMIN).length;
                if (remainingSuper === 0) {
                    user.role = ROLE_SUPERADMIN; // revert
                    return showToast('User', 'At least one Superadmin is required.', 'error');
                }
            }
        } else {
            if (!/^\d{4,6}$/.test(pin || '')) {
                return showToast('User', 'PIN must be 4–6 digits.', 'error');
            }
            user = {
                id: 'u' + (db.users.length + 1),
                name,
                username,
                pin,
                role,
                createdAt: new Date().toISOString()
            };
            db.users.push(user);
        }

        saveDb();
        renderUsersTable();
        populateSalespersonFilter();
        showToast('User saved', `${user.name}`, 'success');
    }

    // -------------------------
    // ADMIN: BACKUP / RESTORE
    // -------------------------

    function downloadBackup() {
        const backup = {
            exportedAt: new Date().toISOString(),
            db
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const todayStr = toDateInput(new Date()).replace(/-/g, '');
        a.href = url;
        a.download = `litepos-backup-${todayStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup', 'Backup JSON downloaded.', 'success');
    }

    function handleRestoreFile(ev) {
        const file = ev.target.files[0];
        if (!file) return;
        if (!confirm('Restoring backup will replace all local data. Continue?')) {
            ev.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const nextDb = parsed.db || parsed;
                if (!nextDb || !nextDb.shop || !nextDb.users) {
                    throw new Error('Invalid backup structure.');
                }
                localStorage.setItem(DB_KEY, JSON.stringify(nextDb));
                saveSession(null);
                showToast('Restore', 'Backup restored. Reloading...', 'success');
                setTimeout(() => location.reload(), 700);
            } catch (e) {
                console.error(e);
                showToast('Restore failed', 'Invalid backup file.', 'error');
            }
        };
        reader.readAsText(file);
        ev.target.value = '';
    }

    // -------------------------
    // UTILITIES
    // -------------------------

    function refreshAllViews() {
        loadShopIntoHeader();
        renderProductSearchTable();
        renderProductsTable();
        renderCustomersTable();
        renderOpenSalesStrip();
        prepareSalesFiltersIfEmpty();
        renderSalesTable();
        refreshKpis();
        renderUsersTable();
        renderTodaySnapshot();
    }

    function showToast(title, message, type) {
        const container = els['toast-container'];
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast ' + (type === 'error' ? 'toast-error' : 'toast-success');

        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.textContent = title;
        toast.appendChild(titleEl);

        if (message) {
            const msgEl = document.createElement('div');
            msgEl.className = 'toast-message';
            msgEl.textContent = message;
            toast.appendChild(msgEl);
        }

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(4px)';
        }, 2800);
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 3400);
    }

    function formatMoney(value) {
        const num = Number(value || 0);
        return '৳ ' + num.toFixed(2);
    }

    function shortMoney(value) {
        const num = Number(value || 0);
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toFixed(0);
    }

    function parseMoneyInput(val) {
        const n = parseFloat(val || '0');
        return isNaN(n) ? 0 : n;
    }

    function toDateInput(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

})();
