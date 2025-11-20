// app/core.js - moved from root app.js to prepare modularization
// Full application logic for LitePOS — BDT

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
    
    // Pagination state
    let currentProductsPage = 1;
    const productsPerPage = 50;

    // Cached DOM references
    const els = {};

    const modalNotifier = (() => {
        const elements = {
            overlay: null,
            card: null,
            title: null,
            message: null,
            actions: null
        };
        let previousFocus = null;
        let currentOptions = null;

        function ensure() {
            if (elements.overlay) return;
            const overlay = document.createElement('div');
            overlay.id = 'modal-notifier';
            overlay.className = 'modal-overlay hidden';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = `
                <div class="modal-card" role="dialog" aria-modal="true">
                    <div class="modal-body">
                        <h3 class="modal-title">Notice</h3>
                        <p class="modal-message"></p>
                    </div>
                    <div class="modal-actions"></div>
                </div>`;
            document.body.appendChild(overlay);

            elements.overlay = overlay;
            elements.card = overlay.querySelector('.modal-card');
            elements.title = overlay.querySelector('.modal-title');
            elements.message = overlay.querySelector('.modal-message');
            elements.actions = overlay.querySelector('.modal-actions');

            overlay.addEventListener('click', evt => {
                if (evt.target === overlay && (!currentOptions || currentOptions.dismissable !== false)) {
                    close();
                }
            });

            window.addEventListener('keydown', evt => {
                if (evt.key === 'Escape' && elements.overlay && !elements.overlay.classList.contains('hidden')) {
                    if (!currentOptions || currentOptions.dismissable !== false) {
                        close();
                    }
                }
            });
        }

        function close() {
            if (!elements.overlay) return;
            elements.overlay.classList.add('hidden');
            elements.overlay.setAttribute('aria-hidden', 'true');
            if (elements.actions) {
                elements.actions.innerHTML = '';
            }
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus();
            }
            previousFocus = null;
            currentOptions = null;
        }

        function show(options = {}) {
            ensure();
            currentOptions = options;
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            const type = options.type || 'info';
            elements.card.setAttribute('data-type', type);
            elements.title.textContent = options.title || 'Notice';
            elements.message.textContent = options.message || '';

            const actions = Array.isArray(options.actions) && options.actions.length
                ? options.actions
                : [{ label: 'OK', variant: 'primary', onClick: null }];
            const hasAutofocus = actions.some(action => action.autofocus);

            elements.actions.innerHTML = '';
            let focusTarget = null;
            actions.forEach((action, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `modal-btn modal-btn-${action.variant || 'primary'}`;
                btn.textContent = action.label || 'OK';
                if (action.title) {
                    btn.title = action.title;
                }
                btn.addEventListener('click', () => {
                    if (typeof action.onClick === 'function') {
                        action.onClick();
                    }
                    if (action.closes !== false) {
                        close();
                    }
                });
                elements.actions.appendChild(btn);
                const shouldFocus = !focusTarget && ((hasAutofocus && action.autofocus) || (!hasAutofocus && index === 0));
                if (shouldFocus) {
                    focusTarget = btn;
                }
            });

            elements.overlay.classList.remove('hidden');
            elements.overlay.setAttribute('aria-hidden', 'false');
            requestAnimationFrame(() => {
                if (focusTarget) {
                    focusTarget.focus();
                }
            });
        }

        return {
            init: ensure,
            show,
            close
        };
    })();

    // -------------------------
    // INIT
    // -------------------------

    function initApp() {
        // If modular APIs are present (from app/modules), prefer them.
        const ns = window.LitePos || {};
        ns.ui = ns.ui || {};
        ns.ui.modalNotifier = modalNotifier;
        window.LitePos = ns;

        modalNotifier.init();

        // Elements: prefer ns.ui.cacheElements to populate ns.elements, but keep local cacheElements fallback
        if (ns.ui && typeof ns.ui.cacheElements === 'function') {
            try {
                ns.ui.cacheElements();
                // mirror to local els for compatibility
                if (ns.elements) {
                    Object.keys(ns.elements).forEach(k => { els[k] = ns.elements[k]; });
                }
            } catch (e) {
                console.error('ns.ui.cacheElements failed, falling back', e);
                cacheElements();
            }
        } else {
            cacheElements();
        }

        // Attach handlers (core's attachGlobalHandlers remains primary)
        try {
            attachGlobalHandlers();
        } catch (e) {
            console.error('attachGlobalHandlers error', e);
        }

        // DB load: use ns.api.loadDb if available so module version becomes the source-of-truth
        if (ns.api && typeof ns.api.loadDb === 'function') {
            try {
                db = ns.api.loadDb();
                ns.state = ns.state || {};
                ns.state.db = db;
            } catch (e) {
                console.error('ns.api.loadDb failed, falling back', e);
                db = loadDb();
            }
        } else {
            db = loadDb();
        }

        // Session init: prefer ns.api.initSession
        if (ns.api && typeof ns.api.initSession === 'function') {
            try {
                const user = ns.api.initSession();
                if (user) {
                    currentUser = user;
                    ns.state = ns.state || {};
                    ns.state.currentUser = user;
                }
            } catch (e) {
                console.error('ns.api.initSession failed, falling back', e);
                initSession();
            }
        } else {
            initSession();
        }

        decideLoginOrMain();
    }

    // Ensure init runs whether script is loaded before or after DOMContentLoaded
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', initApp);
    } else {
        // DOM already ready — run initialization immediately
        try { initApp(); } catch (e) { console.error('initApp failed', e); }
    }

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
            stock_updates: [],
            counters: {
                nextSaleId: 1
            },
            flags: {
                seededSampleData: false
            }
        };
    }

    function loadDb() {
        // Prefer module API if available
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.loadDb === 'function') {
            try {
                const modDb = window.LitePos.api.loadDb();
                db = modDb;
                return modDb;
            } catch (e) {
                console.error('LitePos.api.loadDb failed, falling back to local loadDb()', e);
            }
        }

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
            db = parsed;
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
        // Prefer module API if available
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveDb === 'function') {
            try {
                window.LitePos.api.saveDb(next);
                // mirror local state
                window.LitePos.state = window.LitePos.state || {};
                window.LitePos.state.db = window.LitePos.state.db || next || db;
                db = window.LitePos.state.db;
                return;
            } catch (e) {
                console.error('LitePos.api.saveDb failed, falling back to local saveDb()', e);
            }
        }

        db = next || db;
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }

    function seedSampleData(target) {
        // prefer module-provided seeding when present
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.seedSampleData === 'function') {
            try {
                window.LitePos.api.seedSampleData(target);
                return;
            } catch (e) {
                console.error('LitePos.api.seedSampleData failed, falling back', e);
            }
        }

        if (target.flags && target.flags.seededSampleData) return;

        target.products = [
            {
                id: 'p1',
                name: 'Milk 1L',
                sku: 'MILK-1L',
                barcode: '8901234567890',
                category: 'Dairy',
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
                barcode: '8901234567891',
                category: 'Dairy',
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
                barcode: '8901234567892',
                category: 'Grains',
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
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.loadSession === 'function') {
            try {
                return window.LitePos.api.loadSession();
            } catch (e) {
                console.error('LitePos.api.loadSession failed, falling back', e);
            }
        }
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function saveSession(session) {
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveSession === 'function') {
            try {
                return window.LitePos.api.saveSession(session);
            } catch (e) {
                console.error('LitePos.api.saveSession failed, falling back', e);
            }
        }
        if (!session) {
            localStorage.removeItem(SESSION_KEY);
        } else {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
    }

    function initSession() {
        // prefer module initSession if provided
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.initSession === 'function') {
            try {
                const user = window.LitePos.api.initSession();
                if (user) {
                    currentUser = user;
                    window.LitePos.state = window.LitePos.state || {};
                    window.LitePos.state.currentUser = user;
                }
                return;
            } catch (e) {
                console.error('LitePos.api.initSession failed, falling back', e);
            }
        }
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
            'summary-customer-name', 'summary-customer-meta', 'summary-customer-status', 'summary-customer-badge',
            'quick-customer-name', 'quick-customer-notes', 'btn-save-quick-customer',
            'btn-clear-customer', 'btn-clear-product-search', 'btn-clear-customer-phone',
            'product-search', 'product-table-body', 'product-overlay', 'product-overlay-body', 'toggle-all-products',
            'customer-overlay', 'customer-overlay-body', 'sale-header-total',
            'cart-table-body', 'cart-table-wrapper', 'cart-empty-state', 'cart-count-chip', 'sale-actions-row',
            'btn-new-sale', 'btn-hold-sale', 'btn-cancel-sale', 'btn-clear-cart',
            'open-sales-list',
            'input-discount', 'input-payment', 'btn-same-as-total',
            'summary-subtotal', 'summary-total', 'summary-items-count',
            'summary-change', 'summary-sale-status', 'summary-sale-id-value',
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
            'product-edit-name', 'product-edit-sku', 'product-edit-barcode', 'product-edit-category',
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
        if (els['login-screen']) els['login-screen'].classList.remove('hidden');
        if (els['main-screen']) els['main-screen'].classList.add('hidden');
        if (els['setup-panel']) els['setup-panel'].classList.remove('hidden');
        if (els['signin-panel']) els['signin-panel'].classList.add('hidden');
    }

    function showLoginOnly() {
        if (els['login-screen']) els['login-screen'].classList.remove('hidden');
        if (els['main-screen']) els['main-screen'].classList.add('hidden');
        if (els['setup-panel']) els['setup-panel'].classList.add('hidden');
        if (els['signin-panel']) els['signin-panel'].classList.remove('hidden');
        populateLoginUserSelect();
    }

    function showMainScreen() {
        console.log('[showMainScreen] Called');
        if (els['login-screen']) els['login-screen'].classList.add('hidden');
        if (els['main-screen']) els['main-screen'].classList.remove('hidden');
        
        // Restore last active tab or default to sale tab
        let savedTab = 'tab-sale';
        try {
            const stored = localStorage.getItem('litepos_current_tab');
            console.log('[showMainScreen] Stored tab:', stored);
            if (stored && ['tab-sale', 'tab-customers', 'tab-products', 'tab-sales', 'tab-reports', 'tab-admin'].includes(stored)) {
                savedTab = stored;
            }
        } catch (e) {
            console.error('Failed to restore tab:', e);
        }
        console.log('[showMainScreen] Switching to tab:', savedTab);
        switchTab(savedTab);
        
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
        if (els['btn-same-as-total']) {
            els['btn-same-as-total'].addEventListener('click', () => {
                console.log('[Same as Payable] Button clicked');
                
                // Sync state from module if needed
                if (window.LitePos && window.LitePos.state && window.LitePos.state.currentSale) {
                    currentSale = window.LitePos.state.currentSale;
                }
                
                if (!currentSale) {
                    currentSale = createEmptySale();
                }
                
                // Get the total amount
                const totalAmount = currentSale.total || 0;
                console.log('[Same as Payable] Total amount:', totalAmount);
                
                // Set the input value
                if (els['input-payment']) {
                    console.log('[Same as Payable] Input element found:', els['input-payment']);
                    els['input-payment'].value = String(totalAmount);
                    console.log('[Same as Payable] Set input value to:', els['input-payment'].value);
                    
                    // Trigger the input event to update currentSale.payment and call updateSaleTotals
                    const event = new Event('input', { bubbles: true });
                    els['input-payment'].dispatchEvent(event);
                    console.log('[Same as Payable] Dispatched input event');
                } else {
                    console.error('[Same as Payable] Input element NOT found!');
                }
            });
        } else {
            console.error('[Event Handler] btn-same-as-total element NOT found!');
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
            els['btn-new-sale'].addEventListener('click', handleNewSaleClick);
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

        // Clear button handlers
        if (els['btn-clear-product-search']) {
            els['btn-clear-product-search'].addEventListener('click', () => {
                if (els['product-search']) {
                    els['product-search'].value = '';
                    renderProductSearchTable();
                }
            });
        }
        if (els['btn-clear-customer-phone']) {
            els['btn-clear-customer-phone'].addEventListener('click', () => {
                if (els['sale-customer-phone']) {
                    els['sale-customer-phone'].value = '';
                    setCurrentCustomer(null);
                    if (els['customer-overlay']) {
                        els['customer-overlay'].classList.add('hidden');
                    }
                }
            });
        }

        // Products tab
        if (els['product-manage-search']) {
            els['product-manage-search'].addEventListener('input', () => {
                currentProductsPage = 1; // Reset to first page on search
                renderProductsTable();
            });
        }
        if (els['product-filter-category']) {
            els['product-filter-category'].addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on filter
                renderProductsTable();
            });
        }
        if (els['product-sort']) {
            els['product-sort'].addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on sort
                renderProductsTable();
            });
        }
        if (els['product-filter-low-stock']) {
            els['product-filter-low-stock'].addEventListener('change', () => {
                currentProductsPage = 1;
                renderProductsTable();
            });
        }
        if (els['btn-product-prev-page']) {
            els['btn-product-prev-page'].addEventListener('click', () => {
                if (currentProductsPage > 1) {
                    currentProductsPage--;
                    renderProductsTable();
                }
            });
        }
        if (els['btn-product-next-page']) {
            els['btn-product-next-page'].addEventListener('click', () => {
                currentProductsPage++;
                renderProductsTable();
            });
        }
        if (els['btn-save-product']) {
            els['btn-save-product'].addEventListener('click', saveProductFromForm);
        }
        if (els['btn-new-product']) {
            els['btn-new-product'].addEventListener('click', clearProductForm);
        }
        if (els['btn-delete-product']) {
            els['btn-delete-product'].addEventListener('click', deleteProduct);
        }
        if (els['btn-save-stock-adjustment']) {
            els['btn-save-stock-adjustment'].addEventListener('click', saveStockAdjustment);
        }
        if (els['btn-toggle-stock-updates']) {
            els['btn-toggle-stock-updates'].addEventListener('click', (e) => {
                e.stopPropagation();
                const body = document.getElementById('stock-updates-body');
                const btn = document.getElementById('btn-toggle-stock-updates');
                if (body && btn) {
                    const isHidden = body.style.display === 'none' || !body.style.display || body.style.display === '';
                    body.style.display = isHidden ? 'block' : 'none';
                    btn.innerHTML = isHidden 
                        ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>Collapse'
                        : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>Expand';
                }
            });
        }
        if (els['stock-updates-header']) {
            els['stock-updates-header'].addEventListener('click', () => {
                const body = document.getElementById('stock-updates-body');
                const btn = document.getElementById('btn-toggle-stock-updates');
                if (body && btn) {
                    const isHidden = body.style.display === 'none' || !body.style.display || body.style.display === '';
                    body.style.display = isHidden ? 'block' : 'none';
                    btn.innerHTML = isHidden 
                        ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>Collapse'
                        : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>Expand';
                }
            });
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
        console.log('[switchTab] Called with tabId:', tabId);
        console.log('[switchTab] els object keys:', Object.keys(els).length);
        console.log('[switchTab] tab-sale element:', els['tab-sale']);
        
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
                if (id === tabId) {
                    console.log('[switchTab] Removing hidden from:', id);
                    els[id].classList.remove('hidden');
                } else {
                    els[id].classList.add('hidden');
                }
            } else {
                console.warn('[switchTab] Element not found:', id);
            }
        });
        
        // Save current tab to localStorage
        try {
            localStorage.setItem('litepos_current_tab', tabId);
        } catch (e) {
            console.error('Failed to save current tab:', e);
        }

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
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.findCustomerFromInput === 'function') {
            try { return window.LitePos.customers.findCustomerFromInput(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.setCurrentCustomer === 'function') {
            try { 
                // Sync state before calling module
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                }
                window.LitePos.customers.setCurrentCustomer(customer);
                // Sync state back after calling module
                if (window.LitePos.state && window.LitePos.state.currentSale) {
                    currentSale = window.LitePos.state.currentSale;
                }
                // Trigger auto-save after customer update
                if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.autoSaveCurrentSale === 'function') {
                    window.LitePos.pos.autoSaveCurrentSale();
                }
                return;
            } catch (e) { console.error(e); }
        }
        if (!currentSale) {
            currentSale = createEmptySale();
            if (window.LitePos && window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
            }
        }
        currentSale.customer = customer || null;

        if (!customer) {
            if (els['summary-customer-badge']) els['summary-customer-badge'].textContent = 'Walk-in';
            if (els['summary-customer-name']) els['summary-customer-name'].textContent = 'Not selected';
            if (els['summary-customer-meta']) els['summary-customer-meta'].textContent = 'Phone · —';
            if (els['summary-customer-status']) els['summary-customer-status'].textContent = 'Status · New';
            if (els['sale-customer-phone']) els['sale-customer-phone'].value = '';
            if (els['sale-customer-name']) els['sale-customer-name'].value = '';
        } else {
            if (els['summary-customer-badge']) els['summary-customer-badge'].textContent = customer.id ? 'Returning' : 'Walk-in';
            if (els['summary-customer-name']) els['summary-customer-name'].textContent = customer.name || 'Walk-in';
            if (els['summary-customer-meta']) els['summary-customer-meta'].textContent = `Phone · ${customer.phone || '—'}`;
            if (els['summary-customer-status']) els['summary-customer-status'].textContent = customer.id ? 'Status · Existing' : 'Status · New';
            if (els['sale-customer-phone']) els['sale-customer-phone'].value = customer.phone || '';
            if (els['sale-customer-name']) els['sale-customer-name'].value = customer.name || '';
        }
    }

    function saveQuickCustomer() {
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.saveQuickCustomer === 'function') {
            try { return window.LitePos.customers.saveQuickCustomer(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.focusCustomerPhone === 'function') {
            try { return window.LitePos.customers.focusCustomerPhone(); } catch (e) { console.error(e); }
        }
        if (els['sale-customer-phone']) {
            els['sale-customer-phone'].focus();
            els['sale-customer-phone'].select();
        }
    }

    // -------------------------
    // POS: SALE OBJECT & CART
    // -------------------------

    function handleNewSaleClick() {
        const hasItems = currentSale && Array.isArray(currentSale.items) && currentSale.items.length > 0;
        if (!hasItems) {
            startNewSale(true);
            return;
        }

        modalNotifier.show({
            type: 'warning',
            title: 'Cart already has items',
            message: 'Hold this sale to pause and switch, or discard the cart to start fresh.',
            actions: [
                {
                    label: 'Hold sale',
                    variant: 'primary',
                    autofocus: true,
                    onClick: () => holdCurrentSale()
                },
                {
                    label: 'Discard items & start new',
                    variant: 'danger',
                    onClick: () => startNewSale(true)
                },
                {
                    label: 'Keep editing',
                    variant: 'ghost'
                }
            ]
        });
    }

    function createEmptySale() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.createEmptySale === 'function') {
            try { return window.LitePos.pos.createEmptySale(); } catch (e) { console.error(e); }
        }
        return {
            id: null,
            status: 'new',
            items: [],
            discount: 0,
            payment: 0,
            subtotal: 0,
            total: 0,
            change: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            customer: null,
            salespersonId: currentUser ? currentUser.id : null
        };
    }

    function startNewSale(notify) {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.startNewSale === 'function') {
            try {
                window.LitePos.pos.startNewSale(notify);
                // Sync module state back to core
                if (window.LitePos.state && window.LitePos.state.currentSale) {
                    currentSale = window.LitePos.state.currentSale;
                }
                return;
            } catch (e) { console.error(e); }
        }
        currentSale = createEmptySale();
        if (window.LitePos && window.LitePos.state) {
            window.LitePos.state.currentSale = currentSale;
        }
        setCurrentCustomer(null);
        els['input-discount'].value = '0';
        els['input-payment'].value = '0';
        els['cart-table-body'].innerHTML = '';
        els['summary-sale-status'].textContent = 'New';
        if (els['summary-sale-id-value']) {
            els['summary-sale-id-value'].textContent = 'New';
        }
        syncCartUiState(false, { count: 0, hasSaleId: false });
        renderCartTable();
        renderOpenSalesStrip();
        updateSaleTotals();
        if (notify) showToast('New sale', 'Started a new sale.', 'success');
        focusCustomerPhone();
    }

    function clearCart() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.clearCart === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
                window.LitePos.pos.clearCart();
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
        if (!currentSale) return;
        currentSale.items = [];
        updateSaleTotals();
        renderCartTable();
    }

    function clampDiscount() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.clampDiscount === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
                window.LitePos.pos.clampDiscount();
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
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
        console.log('[updateSaleTotals CORE] Called, currentSale.payment:', currentSale?.payment);
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.updateSaleTotals === 'function') {
            try {
                console.log('[updateSaleTotals CORE] Delegating to module...');
                // Sync core state to module state before calling
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                    console.log('[updateSaleTotals CORE] Before module, state.payment:', window.LitePos.state.currentSale?.payment);
                }
                window.LitePos.pos.updateSaleTotals();
                // Sync back
                if (window.LitePos.state && window.LitePos.state.currentSale) {
                    console.log('[updateSaleTotals CORE] After module, state.payment:', window.LitePos.state.currentSale.payment);
                    currentSale = window.LitePos.state.currentSale;
                    console.log('[updateSaleTotals CORE] Synced back, currentSale.payment:', currentSale.payment);
                }
                return;
            } catch (e) { console.error(e); }
        }
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

        // Sync to module state
        if (window.LitePos && window.LitePos.state) {
            window.LitePos.state.currentSale = currentSale;
        }

        els['summary-subtotal'].textContent = formatMoney(subtotal);
        els['summary-total'].textContent = formatMoney(currentSale.total);
        if (els['sale-header-total']) els['sale-header-total'].textContent = formatMoney(currentSale.total);
        els['summary-items-count'].textContent = String(currentSale.items.reduce((s, it) => s + it.qty, 0));
        els['summary-change'].textContent = formatMoney(currentSale.change);
        // Only update input fields if user is not actively editing them
        const active = document.activeElement;
        if (active !== els['input-discount']) {
            els['input-discount'].value = currentSale.discount || 0;
        }
        if (active !== els['input-payment']) {
            els['input-payment'].value = currentSale.payment || 0;
        }
    }

    function syncCartUiState(hasItems, meta = {}) {
        const cartTableWrapper = els['cart-table-wrapper'] || document.getElementById('cart-table-wrapper');
        const emptyState = els['cart-empty-state'] || document.getElementById('cart-empty-state');
        const countChip = els['cart-count-chip'] || document.getElementById('cart-count-chip');
        const actionsRow = els['sale-actions-row'] || document.getElementById('sale-actions-row');
        const showEmpty = !hasItems;
        if (cartTableWrapper) {
            cartTableWrapper.classList.toggle('hidden', showEmpty);
        }
        if (emptyState) {
            emptyState.classList.toggle('hidden', !showEmpty);
        }

        const count = typeof meta.count === 'number'
            ? meta.count
            : (currentSale && Array.isArray(currentSale.items)
                ? currentSale.items.reduce((sum, it) => sum + (it.qty || 0), 0)
                : 0);
        if (countChip) {
            if (count > 0) {
                countChip.textContent = `${count} item${count === 1 ? '' : 's'}`;
                countChip.classList.remove('hidden');
            } else {
                countChip.classList.add('hidden');
            }
        }

        const hasSaleId = typeof meta.hasSaleId === 'boolean'
            ? meta.hasSaleId
            : !!(currentSale && currentSale.id);
        const forceShowActions = typeof meta.forceShowActions === 'boolean' ? meta.forceShowActions : null;
        const shouldShowActions = forceShowActions !== null ? forceShowActions : (hasItems || hasSaleId);
        if (actionsRow) {
            actionsRow.classList.toggle('hidden', !shouldShowActions);
        }
    }

    window.LitePos = window.LitePos || {};
    window.LitePos.ui = window.LitePos.ui || {};
    window.LitePos.ui.syncCartUiState = syncCartUiState;

    function renderCartTable() {
        let renderedByModule = false;
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.renderCartTable === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
                window.LitePos.pos.renderCartTable();
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                renderedByModule = true;
            } catch (e) { console.error(e); }
        }

        const itemCount = currentSale && Array.isArray(currentSale.items)
            ? currentSale.items.reduce((sum, it) => sum + (it.qty || 0), 0)
            : 0;
        const hasItems = itemCount > 0;
        const hasSaleId = !!(currentSale && currentSale.id);
        const meta = { count: itemCount, hasSaleId };
        if (renderedByModule) {
            syncCartUiState(hasItems, meta);
            return;
        }

        const tbody = els['cart-table-body'];
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';
        if (!currentSale) {
            syncCartUiState(false, { count: 0, hasSaleId: false });
            return;
        }

        syncCartUiState(hasItems, meta);
        if (!hasItems) {
            return;
        }

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
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.changeCartQty === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
                window.LitePos.pos.changeCartQty(index, delta);
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.removeCartItem === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
                window.LitePos.pos.removeCartItem(index);
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
        if (!currentSale || !currentSale.items[index]) return;
        currentSale.items.splice(index, 1);
        renderCartTable();
    }

    function addProductToCart(skuOrBarcode) {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.addProductToCart === 'function') {
            try {
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                }
                window.LitePos.pos.addProductToCart(skuOrBarcode);
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                resetProductSearchAfterAdd();
                return;
            } catch (e) { console.error(e); }
        }
        if (!currentSale) {
            currentSale = createEmptySale();
            if (window.LitePos && window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
            }
        }
        // Find product by SKU or barcode
        const product = db.products.find(p => p.sku === skuOrBarcode || p.barcode === skuOrBarcode);
        if (!product) return;

        const existing = currentSale.items.find(it => it.sku === product.sku);
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
        updateSaleTotals();
        resetProductSearchAfterAdd();
    }

    function resetProductSearchAfterAdd() {
        let needsRender = false;
        if (els['product-search']) {
            if (els['product-search'].value !== '') needsRender = true;
            els['product-search'].value = '';
            els['product-search'].focus();
        }
        if (els['product-overlay']) {
            els['product-overlay'].classList.add('hidden');
        }
        if (needsRender) {
            renderProductSearchTable();
        }
    }

    // -------------------------
    // POS: PRODUCT SEARCH TABLE
    // -------------------------

    function renderProductSearchTable() {
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.renderProductSearchTable === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                return window.LitePos.products.renderProductSearchTable();
            } catch (e) { console.error(e); }
        }
        const tbody = els['product-overlay-body'];
        tbody.innerHTML = '';
        const query = (els['product-search'].value || '').trim().toLowerCase();

        const products = db.products || [];
        const filtered = products.filter(p => {
            if (!query) return true;
            const text = (p.name + ' ' + p.sku + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase();
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

            const tdBarcode = document.createElement('td');
            tdBarcode.textContent = p.barcode || '—';
            tdBarcode.style.fontSize = '12px';
            tdBarcode.style.color = 'var(--text-soft)';
            tr.appendChild(tdBarcode);

            const tdCategory = document.createElement('td');
            tdCategory.textContent = p.category || '—';
            tdCategory.style.fontSize = '12px';
            tr.appendChild(tdCategory);

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

            if (idx === 0) {
                // not a real focus, just visual
            }
        });
    }

    window.renderProductSearchTable = renderProductSearchTable;

    function focusProductSearch() {
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.focusProductSearch === 'function') {
            try { return window.LitePos.products.focusProductSearch(); } catch (e) { console.error(e); }
        }
        if (els['product-search']) {
            els['product-search'].focus();
            els['product-search'].select();
        }
    }

    // -------------------------
    // POS: OPEN / HOLD / CANCEL / COMPLETE
    // -------------------------

    function persistSaleAsOpen(sale) {
        if (!sale || !Array.isArray(sale.items) || sale.items.length === 0) {
            return null;
        }
        const now = new Date().toISOString();
        sale.status = 'open';
        sale.updatedAt = now;
        if (!sale.createdAt) sale.createdAt = now;

        if (!sale.id) {
            const newId = 'S' + String(db.counters.nextSaleId++).padStart(4, '0');
            sale.id = newId;
        }

        const saleCopy = structuredCloneSale(sale);
        const idx = db.sales.findIndex(s => s.id === saleCopy.id);
        if (idx === -1) {
            db.sales.push(saleCopy);
        } else {
            db.sales[idx] = saleCopy;
        }
        saveDb();
        return saleCopy.id;
    }

    function holdCurrentSale() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.holdCurrentSale === 'function') {
            try {
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                }
                window.LitePos.pos.holdCurrentSale();
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                renderCartTable();
                updateSaleTotals();
                renderOpenSalesStrip();
                return;
            } catch (e) { console.error(e); }
        }
        if (!currentSale || currentSale.items.length === 0) {
            return showToast('Hold sale', 'Cart is empty.', 'error');
        }
        const heldId = persistSaleAsOpen(currentSale);
        if (!heldId) {
            return;
        }
        showToast('Sale held', `Sale ${heldId} saved as open.`, 'success');
        
        // Clear auto-save and start a new sale after holding
        if (window.LitePos && window.LitePos.pos && window.LitePos.pos.clearAutoSave) {
            window.LitePos.pos.clearAutoSave();
        }
        
        // Start new sale and immediately update open sales list
        startNewSale(true);
        renderOpenSalesStrip();
    }

    function cancelCurrentSale() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.cancelCurrentSale === 'function') {
            try {
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                }
                window.LitePos.pos.cancelCurrentSale();
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.completeCurrentSale === 'function') {
            try {
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.currentUser = currentUser;
                    window.LitePos.state.db = db;
                }
                window.LitePos.pos.completeCurrentSale();
                if (window.LitePos.state) {
                    if (window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                    if (window.LitePos.state.lastClosedSaleId) lastClosedSaleId = window.LitePos.state.lastClosedSaleId;
                }
                return;
            } catch (e) { console.error(e); }
        }
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
        if (els['summary-sale-id-value']) els['summary-sale-id-value'].textContent = currentSale.id;
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
        const card = document.getElementById('open-sales-card');
        if (!container || !card) return;
        container.innerHTML = '';
        const activeSaleId = currentSale && currentSale.id ? currentSale.id : null;
        const openSales = db.sales.filter(s => s.status === 'open' && (!activeSaleId || s.id !== activeSaleId));
        
        // Hide card if no open sales
        if (openSales.length === 0) {
            if (card) card.classList.add('hidden');
            if (els['kpi-open-sales']) {
                els['kpi-open-sales'].textContent = '0';
            }
            return;
        }
        
        // Show card if we have open sales
        if (card) card.classList.remove('hidden');
        if (els['kpi-open-sales']) {
            els['kpi-open-sales'].textContent = String(openSales.length);
        }
        
        openSales.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

        openSales.forEach(sale => {
            const row = document.createElement('tr');
            row.className = 'open-sale-row';
            row.style.cursor = 'default';
            
            // Sale ID
            const idCell = document.createElement('td');
            idCell.textContent = sale.id;
            idCell.style.fontWeight = '600';
            row.appendChild(idCell);
            
            // Customer
            const custCell = document.createElement('td');
            const customerName = sale.customer && sale.customer.name ? sale.customer.name : 'Walk-in';
            const customerPhone = sale.customer && sale.customer.phone ? ` (${sale.customer.phone})` : '';
            custCell.textContent = customerName + customerPhone;
            row.appendChild(custCell);
            
            // Items count
            const itemsCell = document.createElement('td');
            const itemCount = (sale.items || []).reduce((sum, it) => sum + (it.qty || 0), 0);
            itemsCell.textContent = itemCount;
            itemsCell.style.textAlign = 'center';
            row.appendChild(itemsCell);
            
            // Total
            const totalCell = document.createElement('td');
            totalCell.textContent = formatMoney(sale.total || 0);
            totalCell.style.textAlign = 'right';
            totalCell.style.fontWeight = '600';
            row.appendChild(totalCell);
            
            // Time
            const timeCell = document.createElement('td');
            if (sale.createdAt) {
                const d = new Date(sale.createdAt);
                timeCell.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            } else {
                timeCell.textContent = '--';
            }
            timeCell.style.textAlign = 'center';
            row.appendChild(timeCell);
            
            // Actions (resume + cancel)
            const actionsCell = document.createElement('td');
            actionsCell.style.textAlign = 'center';
            actionsCell.style.display = 'flex';
            actionsCell.style.justifyContent = 'center';
            actionsCell.style.gap = '6px';

            const resumeBtn = document.createElement('button');
            resumeBtn.className = 'btn btn-primary';
            resumeBtn.style.padding = '4px 10px';
            resumeBtn.style.fontSize = '12px';
            resumeBtn.textContent = 'Resume';
            resumeBtn.title = 'Resume this sale';
            resumeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadOpenSale(sale.id);
            });
            actionsCell.appendChild(resumeBtn);

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-ghost';
            cancelBtn.style.padding = '4px 8px';
            cancelBtn.style.fontSize = '12px';
            cancelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle;"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>';
            cancelBtn.title = 'Cancel this sale';
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                cancelOpenSale(sale.id);
            });
            actionsCell.appendChild(cancelBtn);
            row.appendChild(actionsCell);
            container.appendChild(row);
        });
    }

    if (window.LitePos && window.LitePos.pos) {
        window.LitePos.pos.renderOpenSalesStrip = renderOpenSalesStrip;
    }

    function cancelOpenSale(saleId) {
        const idx = db.sales.findIndex(s => s.id === saleId && s.status === 'open');
        if (idx === -1) {
            return showToast('Error', 'Open sale not found.', 'error');
        }
        
        if (!confirm(`Cancel open sale ${saleId}? This cannot be undone.`)) {
            return;
        }
        
        db.sales.splice(idx, 1);
        saveDb();
        renderOpenSalesStrip();
        showToast('Sale cancelled', `Sale ${saleId} removed.`, 'success');
    }

    function loadOpenSale(saleId) {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.loadOpenSale === 'function') {
            try {
                if (window.LitePos.state) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.state.db = db;
                }
                window.LitePos.pos.loadOpenSale(saleId);
                if (window.LitePos.state && window.LitePos.state.currentSale) currentSale = window.LitePos.state.currentSale;
                return;
            } catch (e) { console.error(e); }
        }
        const sale = db.sales.find(s => s.id === saleId && s.status === 'open');
        if (!sale) {
            return showToast('Open sale', 'Held sale not found.', 'error');
        }

        const activeSaleId = currentSale && currentSale.id ? currentSale.id : null;
        const activeHasItems = currentSale && Array.isArray(currentSale.items) && currentSale.items.length > 0;
        if (activeSaleId === saleId && activeHasItems) {
            return showToast('Open sale', `Sale ${saleId} is already in the cart.`, 'info');
        }

        if (activeHasItems && (!activeSaleId || activeSaleId !== saleId)) {
            const stashedId = persistSaleAsOpen(currentSale);
            if (stashedId) {
                showToast('Sale held', `Sale ${stashedId} saved before switching.`, 'info');
            }
        }

        currentSale = structuredCloneSale(sale);
        currentSale.status = 'open';
        if (window.LitePos && window.LitePos.state) {
            window.LitePos.state.currentSale = currentSale;
        }
        setCurrentCustomer(currentSale.customer || null);
        renderCartTable();
        updateSaleTotals();
        els['summary-sale-status'].textContent = `Open · ${sale.id}`;
        if (els['summary-sale-id-value']) els['summary-sale-id-value'].textContent = sale.id;
        switchTab('tab-sale');
        renderOpenSalesStrip();
        focusProductSearch();
        showToast('Open sale', `Resumed ${sale.id}.`, 'success');
    }

    // -------------------------
    // POS: RECEIPT
    // -------------------------

    function fillReceiptFromSale(sale) {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.fillReceiptFromSale === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.pos.fillReceiptFromSale(sale);
                return;
            } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.printLastReceipt === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.pos.printLastReceipt();
                return;
            } catch (e) { console.error(e); }
        }
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
        console.log('[renderCustomersTable] Called');
        console.log('[renderCustomersTable] els[customers-table-body]:', els['customers-table-body']);
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.renderCustomersTable === 'function') {
            try {
                console.log('[renderCustomersTable] Delegating to module');
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.customers.renderCustomersTable();
                return;
            } catch (e) { console.error(e); }
        }
        console.log('[renderCustomersTable] Using fallback, db.customers:', db.customers?.length);
        const tbody = els['customers-table-body'];
        if (!tbody) {
            console.error('[renderCustomersTable] tbody element not found!');
            return;
        }
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
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.loadCustomerToForm === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.customers.loadCustomerToForm(id);
                return;
            } catch (e) { console.error(e); }
        }
        const c = db.customers.find(cu => cu.id === id);
        if (!c) return;
        els['customer-edit-name'].value = c.name;
        els['customer-edit-phone'].value = c.phone;
        els['customer-edit-notes'].value = c.notes || '';
        els['customer-edit-name'].dataset.customerId = c.id;
    }

    function clearCustomerForm() {
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.clearCustomerForm === 'function') {
            try {
                window.LitePos.customers.clearCustomerForm();
                return;
            } catch (e) { console.error(e); }
        }
        els['customer-edit-name'].value = '';
        els['customer-edit-phone'].value = '';
        els['customer-edit-notes'].value = '';
        delete els['customer-edit-name'].dataset.customerId;
    }

    function saveCustomerFromForm() {
        if (window.LitePos && window.LitePos.customers && typeof window.LitePos.customers.saveCustomerFromForm === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.customers.saveCustomerFromForm();
                if (window.LitePos.state && window.LitePos.state.db) db = window.LitePos.state.db;
                return;
            } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.renderProductsTable === 'function') {
            try { return window.LitePos.products.renderProductsTable(); } catch (e) { console.error(e); }
        }
        const tbody = els['products-table-body'];
        tbody.innerHTML = '';
        const query = (els['product-manage-search'].value || '').trim().toLowerCase();
        const categoryFilter = els['product-filter-category'] ? els['product-filter-category'].value : '';
        const lowStockOnly = els['product-filter-low-stock'] ? els['product-filter-low-stock'].checked : false;
        const sortBy = els['product-sort'] ? els['product-sort'].value : 'name-asc';

        // Filter products
        let filtered = db.products.slice();
        
        if (query) {
            filtered = filtered.filter(p => {
                const txt = (p.name + ' ' + p.sku + ' ' + (p.barcode || '') + ' ' + (p.category || '')).toLowerCase();
                return txt.includes(query);
            });
        }
        
        if (categoryFilter) {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }
        
        if (lowStockOnly) {
            filtered = filtered.filter(p => p.stock <= (p.lowStockAt || 0));
        }
        
        // Apply sorting
        const [sortField, sortDir] = sortBy.split('-');
        filtered.sort((a, b) => {
            let valA, valB;
            if (sortField === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
                return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            } else if (sortField === 'buy') {
                valA = a.buyPrice || 0;
                valB = b.buyPrice || 0;
            } else if (sortField === 'sell') {
                valA = a.sellPrice || 0;
                valB = b.sellPrice || 0;
            } else if (sortField === 'stock') {
                valA = a.stock || 0;
                valB = b.stock || 0;
            }
            return sortDir === 'asc' ? valA - valB : valB - valA;
        });

        // Update total count and badge
        if (els['product-total-count']) {
            if (lowStockOnly && filtered.length === 0) {
                els['product-total-count'].textContent = 'No low stock items';
            } else if (lowStockOnly) {
                els['product-total-count'].textContent = `${filtered.length} low stock ${filtered.length === 1 ? 'item' : 'items'} | Showing page ${currentProductsPage} of ${Math.max(1, Math.ceil(filtered.length / productsPerPage))}`;
            } else {
                els['product-total-count'].textContent = `${filtered.length} total | Showing page ${currentProductsPage} of ${Math.max(1, Math.ceil(filtered.length / productsPerPage))}`;
            }
        }
        if (els['product-count-badge']) {
            els['product-count-badge'].textContent = `${db.products.length} products`;
        }

        // Pagination
        const totalProducts = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalProducts / productsPerPage));
        
        // Clamp current page
        if (currentProductsPage > totalPages) currentProductsPage = totalPages;
        if (currentProductsPage < 1) currentProductsPage = 1;
        
        const startIdx = (currentProductsPage - 1) * productsPerPage;
        const endIdx = startIdx + productsPerPage;
        const pageProducts = filtered.slice(startIdx, endIdx);

        // Update pagination UI - removed duplicate display
        if (els['btn-product-prev-page']) {
            els['btn-product-prev-page'].disabled = currentProductsPage <= 1;
        }
        if (els['btn-product-next-page']) {
            els['btn-product-next-page'].disabled = currentProductsPage >= totalPages;
        }

        // Render products
        pageProducts.forEach(p => {
            const tr = document.createElement('tr');
            if (p.stock <= (p.lowStockAt || 0)) {
                tr.classList.add('low-stock-row');
            }
            tr.addEventListener('click', () => loadProductToForm(p.id));

            const tdId = document.createElement('td');
            tdId.textContent = formatProductId(p.id);
            tdId.style.fontFamily = 'monospace';
            tdId.style.fontSize = '12px';
            tdId.style.color = 'var(--text-soft)';
            tr.appendChild(tdId);

            const tdName = document.createElement('td');
            tdName.textContent = p.name;
            tr.appendChild(tdName);

            const tdSku = document.createElement('td');
            tdSku.textContent = p.sku;
            tr.appendChild(tdSku);

            const tdBarcode = document.createElement('td');
            tdBarcode.textContent = p.barcode || '—';
            tdBarcode.style.fontSize = '12px';
            tr.appendChild(tdBarcode);

            const tdCategory = document.createElement('td');
            tdCategory.textContent = p.category || '—';
            tdCategory.style.fontSize = '12px';
            tr.appendChild(tdCategory);

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
        
        // Update category suggestions
        updateCategorySuggestions();
    }
    
    function updateCategorySuggestions() {
        // Update category filter dropdown
        if (els['product-filter-category']) {
            const categories = [...new Set(db.products.map(p => p.category).filter(c => c))].sort();
            const currentValue = els['product-filter-category'].value;
            els['product-filter-category'].innerHTML = '<option value="">All Categories</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                els['product-filter-category'].appendChild(opt);
            });
            els['product-filter-category'].value = currentValue;
        }
        
        // Update category datalist for autocomplete
        if (els['category-suggestions']) {
            const categories = [...new Set(db.products.map(p => p.category).filter(c => c))].sort();
            els['category-suggestions'].innerHTML = '';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                els['category-suggestions'].appendChild(opt);
            });
        }
    }

    function loadProductToForm(id) {
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.loadProductToForm === 'function') {
            try { return window.LitePos.products.loadProductToForm(id); } catch (e) { console.error(e); }
        }
        const p = db.products.find(p => p.id === id);
        if (!p) return;
        els['product-edit-name'].value = p.name;
        els['product-edit-sku'].value = p.sku;
        if (els['product-edit-barcode']) els['product-edit-barcode'].value = p.barcode || '';
        if (els['product-edit-category']) els['product-edit-category'].value = p.category || '';
        els['product-edit-buy'].value = p.buyPrice;
        els['product-edit-sell'].value = p.sellPrice;
        els['product-edit-stock'].value = p.stock;
        
        // Disable stock input for existing products
        if (els['product-edit-stock']) {
            els['product-edit-stock'].disabled = true;
            els['product-edit-stock'].style.backgroundColor = 'var(--bg-soft)';
            els['product-edit-stock'].style.cursor = 'not-allowed';
        }
        
        // Show stock adjustment card and updates log
        if (els['stock-adjustment-card']) {
            els['stock-adjustment-card'].style.display = 'block';
            if (els['stock-current-value']) {
                els['stock-current-value'].textContent = p.stock;
            }
            // Set today's date
            if (els['stock-adjustment-date']) {
                els['stock-adjustment-date'].value = new Date().toISOString().split('T')[0];
            }
        }
        if (els['stock-updates-card']) {
            els['stock-updates-card'].style.display = 'block';
            renderStockUpdatesTable(id);
        }
        els['product-edit-low'].value = p.lowStockAt || 0;
        els['product-edit-name'].dataset.productId = p.id;
        
        // Show delete button for existing products
        if (els['btn-delete-product']) {
            els['btn-delete-product'].style.display = 'inline-block';
        }
    }

    function clearProductForm() {
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.clearProductForm === 'function') {
            try { return window.LitePos.products.clearProductForm(); } catch (e) { console.error(e); }
        }
        els['product-edit-name'].value = '';
        els['product-edit-sku'].value = '';
        if (els['product-edit-barcode']) els['product-edit-barcode'].value = '';
        if (els['product-edit-category']) els['product-edit-category'].value = '';
        els['product-edit-buy'].value = '';
        els['product-edit-sell'].value = '';
        els['product-edit-stock'].value = '';
        
        // Re-enable stock input for new products
        if (els['product-edit-stock']) {
            els['product-edit-stock'].disabled = false;
            els['product-edit-stock'].style.backgroundColor = '';
            els['product-edit-stock'].style.cursor = '';
        }
        
        // Hide stock adjustment and updates cards
        if (els['stock-adjustment-card']) els['stock-adjustment-card'].style.display = 'none';
        if (els['stock-updates-card']) els['stock-updates-card'].style.display = 'none';
        
        // Clear stock adjustment form
        if (els['stock-adjustment-qty']) els['stock-adjustment-qty'].value = '';
        if (els['stock-adjustment-note']) els['stock-adjustment-note'].value = '';
        els['product-edit-low'].value = '';
        delete els['product-edit-name'].dataset.productId;
        
        // Hide delete button for new products
        if (els['btn-delete-product']) {
            els['btn-delete-product'].style.display = 'none';
        }
    }

    function deleteProduct() {
        const productId = els['product-edit-name'].dataset.productId;
        if (!productId) {
            return showToast('Error', 'No product selected to delete.', 'error');
        }
        
        const product = db.products.find(p => p.id === productId);
        if (!product) {
            return showToast('Error', 'Product not found.', 'error');
        }
        
        // Ask for confirmation
        const confirmed = confirm(`Are you sure you want to delete "${product.name}" (SKU: ${product.sku})?\n\nThis action cannot be undone.`);
        if (!confirmed) {
            return;
        }
        
        // Remove product from database
        const index = db.products.findIndex(p => p.id === productId);
        if (index !== -1) {
            db.products.splice(index, 1);
        }
        
        // Remove associated stock updates
        if (db.stock_updates) {
            db.stock_updates = db.stock_updates.filter(u => u.productId !== productId);
        }
        
        saveDb();
        renderProductsTable();
        renderProductSearchTable();
        clearProductForm();
        showToast('Product Deleted', `${product.name} has been removed.`, 'success');
    }

    function saveProductFromForm() {
        if (window.LitePos && window.LitePos.products && typeof window.LitePos.products.saveProductFromForm === 'function') {
            try { return window.LitePos.products.saveProductFromForm(); } catch (e) { console.error(e); }
        }
        const name = els['product-edit-name'].value.trim();
        const sku = els['product-edit-sku'].value.trim();
        const barcode = els['product-edit-barcode'] ? els['product-edit-barcode'].value.trim() : '';
        const category = els['product-edit-category'] ? els['product-edit-category'].value.trim() : '';
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
        
        // Unique Barcode (if provided)
        if (barcode) {
            const barcodeDup = db.products.find(p => p.barcode === barcode && p.id !== existingId);
            if (barcodeDup) {
                return showToast('Product', 'Another product already uses this barcode.', 'error');
            }
        }

        if (product) {
            product.name = name;
            product.sku = sku;
            product.barcode = barcode;
            product.category = category;
            product.buyPrice = buy;
            product.sellPrice = sell;
            product.stock = stock;
            product.lowStockAt = low;
        } else {
            product = {
                id: 'p' + (db.products.length + 1),
                name,
                sku,
                barcode,
                category,
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
        clearProductForm();
        showToast('Product saved', `${product.name}`, 'success');
    }
    
    // -------------------------
    // STOCK ADJUSTMENTS
    // -------------------------
    
    function saveStockAdjustment() {
        const productId = els['product-edit-name'].dataset.productId;
        if (!productId) {
            return showToast('Error', 'No product selected.', 'error');
        }
        
        const product = db.products.find(p => p.id === productId);
        if (!product) {
            return showToast('Error', 'Product not found.', 'error');
        }
        
        const qtyChange = parseInt(els['stock-adjustment-qty'].value || '0', 10);
        const date = els['stock-adjustment-date'].value || new Date().toISOString().split('T')[0];
        const note = (els['stock-adjustment-note'].value || '').trim();
        
        if (qtyChange === 0) {
            return showToast('Stock Adjustment', 'Adjustment quantity cannot be zero.', 'error');
        }
        
        const newStock = product.stock + qtyChange;
        
        // Validate that stock doesn't go negative
        if (newStock < 0) {
            return showToast('Stock Adjustment', `Cannot reduce stock by ${Math.abs(qtyChange)}. Current stock is ${product.stock}.`, 'error');
        }
        
        // Create stock update record
        const stockUpdate = {
            id: 'su' + Date.now(),
            productId: productId,
            productName: product.name,
            productSku: product.sku,
            qtyChange: qtyChange,
            stockBefore: product.stock,
            stockAfter: newStock,
            date: date,
            note: note,
            createdAt: new Date().toISOString(),
            createdBy: currentUser ? currentUser.id : null
        };
        
        // Initialize stock_updates array if it doesn't exist
        if (!db.stock_updates) db.stock_updates = [];
        
        db.stock_updates.push(stockUpdate);
        
        // Update product stock
        product.stock = newStock;
        
        saveDb();
        renderProductsTable();
        renderProductSearchTable();
        renderStockUpdatesTable(productId);
        
        // Update current stock display
        if (els['stock-current-value']) {
            els['stock-current-value'].textContent = newStock;
        }
        if (els['product-edit-stock']) {
            els['product-edit-stock'].value = newStock;
        }
        
        // Clear adjustment form
        if (els['stock-adjustment-qty']) els['stock-adjustment-qty'].value = '';
        if (els['stock-adjustment-note']) els['stock-adjustment-note'].value = '';
        if (els['stock-adjustment-date']) {
            els['stock-adjustment-date'].value = new Date().toISOString().split('T')[0];
        }
        
        showToast('Stock Updated', `${qtyChange > 0 ? '+' : ''}${qtyChange} units. New stock: ${newStock}`, 'success');
    }
    
    function renderStockUpdatesTable(productId) {
        console.log('[STOCK HISTORY] Called for product:', productId);
        
        // Use getElementById to ensure we get the element even if cache is stale
        const tbody = document.getElementById('stock-updates-table-body');
        const body = document.getElementById('stock-updates-body');
        const btn = document.getElementById('btn-toggle-stock-updates');
        
        console.log('[STOCK HISTORY] Found elements - tbody:', !!tbody, 'body:', !!body, 'btn:', !!btn);
        
        if (!tbody) {
            console.error('[STOCK HISTORY] tbody element NOT FOUND!');
            return;
        }
        tbody.innerHTML = '';
        
        if (!db.stock_updates) db.stock_updates = [];
        
        console.log('[STOCK HISTORY] Total in DB:', db.stock_updates.length);
        
        const updates = db.stock_updates
            .filter(u => u.productId === productId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('[STOCK HISTORY] Filtered for product:', updates.length, updates);
        
        if (updates.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'No stock adjustments yet.';
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-soft)';
            tr.appendChild(td);
            tbody.appendChild(tr);
            console.log('[STOCK HISTORY] No updates - added empty message row');
            return;
        }
        
        // Auto-expand the table if there are updates  
        if (body && btn && updates.length > 0) {
            body.style.display = 'block';
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>Collapse';
            console.log('[STOCK HISTORY] Auto-expanded table body');
        }
        
        console.log('[STOCK HISTORY] Creating', updates.length, 'table rows...');
        updates.forEach((u, idx) => {
            const tr = document.createElement('tr');
            
            const tdDate = document.createElement('td');
            tdDate.textContent = new Date(u.date).toLocaleDateString();
            tr.appendChild(tdDate);
            
            const tdChange = document.createElement('td');
            tdChange.textContent = (u.qtyChange > 0 ? '+' : '') + u.qtyChange;
            tdChange.style.fontWeight = '600';
            tdChange.style.color = u.qtyChange > 0 ? '#22c55e' : '#ef4444';
            tr.appendChild(tdChange);
            
            const tdBefore = document.createElement('td');
            tdBefore.textContent = u.stockBefore;
            tr.appendChild(tdBefore);
            
            const tdAfter = document.createElement('td');
            tdAfter.textContent = u.stockAfter;
            tr.appendChild(tdAfter);
            
            const tdNote = document.createElement('td');
            tdNote.textContent = u.note || '—';
            tdNote.style.fontSize = '12px';
            tdNote.style.color = 'var(--text-soft)';
            tr.appendChild(tdNote);
            
            tbody.appendChild(tr);
        });
        console.log('[STOCK HISTORY] Finished! tbody now has', tbody.children.length, 'rows');
    }

    // -------------------------
    // SALES TAB
    // -------------------------

    function prepareSalesFiltersIfEmpty() {
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.prepareSalesFiltersIfEmpty === 'function') {
            try { return window.LitePos.sales.prepareSalesFiltersIfEmpty(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.populateSalespersonFilter === 'function') {
            try { return window.LitePos.sales.populateSalespersonFilter(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.clearSalesFilters === 'function') {
            try { return window.LitePos.sales.clearSalesFilters(); } catch (e) { console.error(e); }
        }
        els['sales-filter-from'].value = '';
        els['sales-filter-to'].value = '';
        els['sales-filter-status'].value = 'all';
        els['sales-filter-user'].value = 'all';
        els['sales-filter-query'].value = '';
        renderSalesTable();
    }

    function renderSalesTable() {
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.renderSalesTable === 'function') {
            try { return window.LitePos.sales.renderSalesTable(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.computeProfitForSale === 'function') {
            try { return window.LitePos.sales.computeProfitForSale(sale); } catch (e) { console.error(e); }
        }
        let gross = 0;
        sale.items.forEach(it => {
            gross += (it.price - (it.buyPrice || 0)) * it.qty;
        });
        return gross - (sale.discount || 0);
    }

    // -------------------------
    // REPORTS / KPIs / CHART
    // -------------------------

    function refreshKpis() {
        if (window.LitePos && window.LitePos.reports && typeof window.LitePos.reports.refreshKpis === 'function') {
            try { return window.LitePos.reports.refreshKpis(); } catch (e) { console.error(e); }
        }
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

        const activeSaleId = currentSale && currentSale.id ? currentSale.id : null;
        const openCount = db.sales.filter(s => s.status === 'open' && (!activeSaleId || s.id !== activeSaleId)).length;
        els['kpi-open-sales'].textContent = String(openCount);

        renderTodaySnapshot();
    }

    function renderTodaySnapshot() {
        if (window.LitePos && window.LitePos.reports && typeof window.LitePos.reports.renderTodaySnapshot === 'function') {
            try { return window.LitePos.reports.renderTodaySnapshot(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.reports && typeof window.LitePos.reports.drawSalesChart === 'function') {
            try { return window.LitePos.reports.drawSalesChart(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.reports && typeof window.LitePos.reports.exportCsvReport === 'function') {
            try { return window.LitePos.reports.exportCsvReport(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.reports && typeof window.LitePos.reports.printReport === 'function') {
            try { return window.LitePos.reports.printReport(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.loadShopForm === 'function') {
            try { return window.LitePos.admin.loadShopForm(); } catch (e) { console.error(e); }
        }
        els['shop-name'].value = db.shop.name || '';
        els['shop-address'].value = db.shop.address || '';
        els['shop-phone'].value = db.shop.phone || '';
    }

    function saveShopSettingsFromForm() {
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.saveShopSettingsFromForm === 'function') {
            try { return window.LitePos.admin.saveShopSettingsFromForm(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.renderUsersTable === 'function') {
            try { return window.LitePos.admin.renderUsersTable(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.loadUserToForm === 'function') {
            try { return window.LitePos.admin.loadUserToForm(id); } catch (e) { console.error(e); }
        }
        const u = db.users.find(u => u.id === id);
        if (!u) return;
        els['user-edit-name'].value = u.name;
        els['user-edit-username'].value = u.username;
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = u.role;
        els['user-edit-name'].dataset.userId = u.id;
    }

    function clearUserForm() {
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.clearUserForm === 'function') {
            try { return window.LitePos.admin.clearUserForm(); } catch (e) { console.error(e); }
        }
        els['user-edit-name'].value = '';
        els['user-edit-username'].value = '';
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = ROLE_SALES;
        delete els['user-edit-name'].dataset.userId;
    }

    function saveUserFromForm() {
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.saveUserFromForm === 'function') {
            try { return window.LitePos.admin.saveUserFromForm(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.downloadBackup === 'function') {
            try { return window.LitePos.admin.downloadBackup(); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.handleRestoreFile === 'function') {
            try { return window.LitePos.admin.handleRestoreFile(ev); } catch (e) { console.error(e); }
        }
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
        if (window.LitePos && window.LitePos.utils && typeof window.LitePos.utils.formatMoney === 'function') {
            try { return window.LitePos.utils.formatMoney(value); } catch (e) { console.error(e); }
        }
        const num = Number(value || 0);
        return '৳ ' + num.toFixed(2);
    }
    
    function formatProductId(id) {
        // Extract numeric part from product ID (e.g., 'p1' -> 1, 'p123' -> 123)
        const match = id.match(/\d+/);
        if (match) {
            const num = parseInt(match[0], 10);
            return 'P' + String(num).padStart(5, '0'); // P00001
        }
        return id;
    }

    function shortMoney(value) {
        if (window.LitePos && window.LitePos.utils && typeof window.LitePos.utils.shortMoney === 'function') {
            try { return window.LitePos.utils.shortMoney(value); } catch (e) { console.error(e); }
        }
        const num = Number(value || 0);
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toFixed(0);
    }

    function parseMoneyInput(val) {
        if (window.LitePos && window.LitePos.utils && typeof window.LitePos.utils.parseMoneyInput === 'function') {
            try { return window.LitePos.utils.parseMoneyInput(val); } catch (e) { console.error(e); }
        }
        const n = parseFloat(val || '0');
        return isNaN(n) ? 0 : n;
    }

    function toDateInput(d) {
        if (window.LitePos && window.LitePos.utils && typeof window.LitePos.utils.toDateInput === 'function') {
            try { return window.LitePos.utils.toDateInput(d); } catch (e) { console.error(e); }
        }
        const date = d instanceof Date ? d : new Date(d);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function structuredCloneSale(s) {
        if (window.LitePos && window.LitePos.utils && typeof window.LitePos.utils.structuredClone === 'function') {
            try { return window.LitePos.utils.structuredClone(s); } catch (e) { console.error(e); }
        }
        return JSON.parse(JSON.stringify(s));
    }

    // Expose critical functions for module interop
    window.setCurrentCustomer = setCurrentCustomer;
    window.findCustomerFromInput = findCustomerFromInput;
    window.createEmptySale = createEmptySale;

})();
