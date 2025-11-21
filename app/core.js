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
    const getElement = (id) => {
        // Use ui.getElement() as single source of truth for element caching
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.getElement === 'function') {
            return window.LitePos.ui.getElement(id);
        }
        // Fallback for early initialization before modules load
        if (els[id]) return els[id];
        const el = document.getElementById(id);
        if (el) els[id] = el;
        return el;
    };

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
            // Clear message content to prevent carryover
            if (elements.message) {
                elements.message.innerHTML = '';
            }
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus();
            }
            previousFocus = null;
            currentOptions = null;
        }

        function show(options = {}) {
            ensure();
            
            // Close any existing modal first
            if (!elements.overlay.classList.contains('hidden')) {
                close();
                // Allow a brief moment for the close animation
                setTimeout(() => showInternal(options), 50);
                return;
            }
            
            showInternal(options);
        }
        
        function showInternal(options = {}) {
            currentOptions = options;
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            const type = options.type || 'info';
            elements.card.setAttribute('data-type', type);
            elements.title.textContent = options.title || 'Notice';
            
            // Support both text and HTML messages
            if (options.messageHtml) {
                elements.message.innerHTML = options.messageHtml;
            } else {
                elements.message.textContent = options.message || '';
            }

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

    const modalWindow = (() => {
        const elements = {
            overlay: null,
            window: null,
            header: null,
            title: null,
            closeBtn: null,
            body: null,
            footer: null
        };
        let previousFocus = null;
        let currentOptions = null;

        function ensure() {
            if (elements.overlay) return;
            const overlay = document.createElement('div');
            overlay.id = 'modal-window';
            overlay.className = 'modal-overlay hidden';
            overlay.setAttribute('aria-hidden', 'true');
            overlay.innerHTML = `
                <div class="modal-window" role="dialog" aria-modal="true">
                    <div class="modal-window-header">
                        <h3 class="modal-window-title">Window</h3>
                        <button type="button" class="modal-window-close" aria-label="Close">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 20px; height: 20px;">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div class="modal-window-body"></div>
                    <div class="modal-window-footer"></div>
                </div>`;
            document.body.appendChild(overlay);

            elements.overlay = overlay;
            elements.window = overlay.querySelector('.modal-window');
            elements.header = overlay.querySelector('.modal-window-header');
            elements.title = overlay.querySelector('.modal-window-title');
            elements.closeBtn = overlay.querySelector('.modal-window-close');
            elements.body = overlay.querySelector('.modal-window-body');
            elements.footer = overlay.querySelector('.modal-window-footer');

            elements.closeBtn.addEventListener('click', close);

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
            if (elements.body) {
                elements.body.innerHTML = '';
            }
            if (elements.footer) {
                elements.footer.innerHTML = '';
            }
            if (previousFocus && typeof previousFocus.focus === 'function') {
                previousFocus.focus();
            }
            previousFocus = null;
            currentOptions = null;
        }

        function show(options = {}) {
            ensure();
            
            // Close any existing window first
            if (!elements.overlay.classList.contains('hidden')) {
                close();
                setTimeout(() => showInternal(options), 50);
                return;
            }
            
            showInternal(options);
        }
        
        function showInternal(options = {}) {
            currentOptions = options;
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            elements.title.textContent = options.title || 'Window';
            
            // Set body content (HTML or text)
            if (options.bodyHtml) {
                elements.body.innerHTML = options.bodyHtml;
            } else if (options.body) {
                elements.body.textContent = options.body;
            }

            // Set footer actions
            elements.footer.innerHTML = '';
            if (options.actions && Array.isArray(options.actions) && options.actions.length > 0) {
                elements.footer.style.display = 'flex';
                const hasAutofocus = options.actions.some(action => action.autofocus);
                let focusTarget = null;
                
                options.actions.forEach((action, index) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = `btn btn-${action.variant || 'primary'}`;
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
                    elements.footer.appendChild(btn);
                    
                    const shouldFocus = !focusTarget && ((hasAutofocus && action.autofocus) || (!hasAutofocus && index === 0));
                    if (shouldFocus) {
                        focusTarget = btn;
                    }
                });
                
                if (focusTarget) {
                    requestAnimationFrame(() => focusTarget.focus());
                }
            } else {
                elements.footer.style.display = 'none';
            }

            elements.overlay.classList.remove('hidden');
            elements.overlay.setAttribute('aria-hidden', 'false');
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
        ns.ui.modalWindow = modalWindow;
        window.LitePos = ns;

        modalNotifier.init();
        modalWindow.init();

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
        
        // Update splash screen with shop info
        updateSplashWithShopInfo();

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
    // SPLASH SCREEN MANAGEMENT
    // -------------------------
    
    function hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            // Remove from DOM after fade completes
            setTimeout(() => {
                splash.remove();
            }, 500);
        }
    }

    function updateSplashWithShopInfo() {
        // Update splash screen with shop logo and name if available
        const splashLogoImg = document.getElementById('splash-logo-img');
        const splashLogoText = document.getElementById('splash-logo-text');
        const splashShopName = document.getElementById('splash-shop-name');
        
        if (db && db.settings && db.settings.logoUrl && splashLogoImg) {
            splashLogoImg.src = db.settings.logoUrl;
            splashLogoImg.style.display = 'block';
            if (splashLogoText) splashLogoText.style.display = 'none';
        }
        
        if (db && db.shop && db.shop.name && splashShopName) {
            splashShopName.textContent = db.shop.name;
        }
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
                // mirror local state - always update with the latest
                window.LitePos.state = window.LitePos.state || {};
                window.LitePos.state.db = next || window.LitePos.state.db || db;
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
            'header-logo-img', 'header-logo-text', 'header-logo-container',
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
            'btn-new-sale', 'btn-hold-sale', 'btn-cancel-sale',
            'btn-cancel-edit-sale', 'btn-revert-changes', 'btn-finish-editing',
            'open-sales-list',
            'input-discount', 'discount-percentage', 'discount-type', 'input-payment', 'btn-same-as-total',
            'summary-subtotal', 'summary-total', 'summary-items-count',
            'summary-change', 'summary-sale-status', 'summary-sale-id-value',
            'btn-complete-sale',
            'receipt-size', 'btn-print-last-receipt',
            'today-summary-small', 'today-salesperson-name', 'today-last-sale',

            // Receipt
            'receipt-print', 'receipt-standard', 'receipt-compact',
            'receipt-shop-name', 'receipt-shop-address', 'receipt-shop-phone',
            'receipt-logo-standard', 'receipt-logo-compact',
            'receipt-sale-meta', 'receipt-items-body',
            'receipt-subtotal', 'receipt-discount', 'receipt-total', 'receipt-payment', 'receipt-change',
            'receipt-shop-name-compact', 'receipt-shop-address-compact', 'receipt-shop-phone-compact',
            'receipt-sale-meta-compact', 'receipt-items-body-compact',
            'receipt-subtotal-compact', 'receipt-discount-compact', 'receipt-total-compact', 
            'receipt-payment-compact', 'receipt-change-compact',

            // Customers tab
            'customer-search', 'customers-table-body',
            'customer-edit-name', 'customer-edit-phone', 'customer-edit-address', 'customer-edit-notes',
            'btn-save-customer-edit', 'btn-new-customer',

            // Products tab
            'product-manage-search', 'products-table-body',
            'product-edit-name', 'product-edit-sku', 'product-edit-barcode', 'product-edit-category',
            'product-edit-brand', 'product-edit-supplier',
            'product-edit-buy', 'product-edit-sell',
            'product-edit-stock', 'product-edit-low',
            'product-edit-discount', 'product-edit-discount-type', 'product-edit-discount-until',
            'product-filter-category', 'product-filter-brand', 'product-filter-supplier',
            'product-filter-discount',
            'btn-save-product', 'btn-new-product',

            // Sales tab
            'sales-filter-from', 'sales-filter-to',
            'sales-filter-status', 'sales-filter-user',
            'sales-filter-payment-method',
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
            'shop-logo-input', 'shop-logo-preview', 'shop-logo-preview-img', 'btn-remove-logo',
            'btn-save-shop-settings',
            'global-currency-symbol', 'global-print-size', 'global-print-template',
            'btn-save-global-settings',
            'users-table-body',
            'user-edit-name', 'user-edit-username', 'user-edit-pin', 'user-edit-role',
            'btn-save-user', 'btn-new-user',
            'btn-backup-download', 'btn-backup-download-encrypted', 'backup-file-input',

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
        if (getElement('login-screen')) getElement('login-screen').classList.remove('hidden');
        if (getElement('main-screen')) getElement('main-screen').classList.add('hidden');
        if (getElement('setup-panel')) getElement('setup-panel').classList.remove('hidden');
        if (getElement('signin-panel')) getElement('signin-panel').classList.add('hidden');
        
        // Hide splash screen when showing setup
        hideSplashScreen();
    }

    function showLoginOnly() {
        if (getElement('login-screen')) getElement('login-screen').classList.remove('hidden');
        if (getElement('main-screen')) getElement('main-screen').classList.add('hidden');
        if (getElement('setup-panel')) getElement('setup-panel').classList.add('hidden');
        if (getElement('signin-panel')) getElement('signin-panel').classList.remove('hidden');
        populateLoginUserSelect();
        
        // Hide splash screen when showing login
        hideSplashScreen();
    }

    function showMainScreen() {
        if (getElement('login-screen')) getElement('login-screen').classList.add('hidden');
        if (getElement('main-screen')) getElement('main-screen').classList.remove('hidden');
        
        // Hide splash screen after showing main screen
        hideSplashScreen();
        
        // Apply animation level setting from settings
        const settings = db?.settings || {};
        const animationLevel = settings.animationLevel || 'normal';
        const animationState = animationLevel === 'reduced' ? 'paused' : 'running';
        document.documentElement.style.setProperty('--bilingual-animation', animationState);
        
        // Restore last active tab or default to sale tab
        let savedTab = 'tab-sale';
        try {
            const stored = localStorage.getItem('litepos_current_tab');
            if (stored && ['tab-sale', 'tab-customers', 'tab-products', 'tab-sales', 'tab-reports', 'tab-admin'].includes(stored)) {
                savedTab = stored;
            }
        } catch (e) {
            console.error('Failed to restore tab:', e);
        }
        switchTab(savedTab);

        // If sale tab, focus product search
        if (savedTab === 'tab-sale') {
            focusSaleProductSearchInput();
        }
    }

    function populateLoginUserSelect() {
        const sel = getElement('login-user');
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
        const name = getElement('setup-name').value.trim();
        const username = getElement('setup-username').value.trim();
        const pin = getElement('setup-pin').value.trim();
        const pin2 = getElement('setup-pin-confirm').value.trim();

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
        const userId = getElement('login-user').value;
        const pin = getElement('login-pin').value.trim();
        const user = db.users.find(u => u.id === userId);
        if (!user) return showToast('Login', 'User not found.', 'error');

        if (user.pin !== pin) {
            return showToast('Login', 'Incorrect PIN.', 'error');
        }

        currentUser = user;
        saveSession({ userId: user.id, loggedInAt: new Date().toISOString() });

        showToast('Welcome', `Signed in as ${user.name}`, 'success');
        getElement('login-pin').value = '';
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
        getElement('header-shop-name').textContent = db.shop.name || 'LitePOS';
        getElement('header-shop-address').textContent = db.shop.address || '';
        getElement('header-shop-phone').textContent = db.shop.phone || '';
        
        // Update logo in header
        const logoImg = getElement('header-logo-img');
        const logoText = getElement('header-logo-text');
        if (db.shop && db.shop.logo && logoImg && logoText) {
            logoImg.src = db.shop.logo;
            logoImg.style.display = 'block';
            logoText.style.display = 'none';
        } else if (logoImg && logoText) {
            logoImg.style.display = 'none';
            logoText.style.display = 'block';
        }
        
        if (currentUser) {
            getElement('header-user-label').textContent = currentUser.name;
            getElement('header-user-role').textContent = currentUser.role === ROLE_SUPERADMIN ? 'Superadmin' : 'Sales';
        } else {
            getElement('header-user-label').textContent = 'Not signed in';
            getElement('header-user-role').textContent = '';
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
        if (getElement('btn-setup-create')) {
            getElement('btn-setup-create').addEventListener('click', handleSetupCreate);
        }
        if (getElement('btn-login')) {
            getElement('btn-login').addEventListener('click', handleLogin);
        }
        if (getElement('btn-logout')) {
            getElement('btn-logout').addEventListener('click', handleLogout);
        }

        // Enter key on login PIN
        if (getElement('login-pin')) {
            getElement('login-pin').addEventListener('keydown', ev => {
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
        
        // Warn about unsaved data on page unload
        window.addEventListener('beforeunload', (e) => {
            const db = window.LitePos?.state?.db || {};
            const sales = db.sales || [];
            const lastBackup = db.settings?.lastBackupDate;
            const now = new Date();
            
            // Check if there are sales and no recent backup
            if (sales.length > 0) {
                const daysSinceBackup = lastBackup 
                    ? Math.floor((now - new Date(lastBackup)) / (1000 * 60 * 60 * 24))
                    : 999;
                
                // Warn if no backup in last 7 days or never backed up
                if (daysSinceBackup > 7) {
                    e.preventDefault();
                    e.returnValue = 'You have not created a backup recently. Your data may be lost. Are you sure you want to leave?';
                    return e.returnValue;
                }
            }
        });

        // POS: customer & quick add
        if (getElement('btn-search-customer')) {
            getElement('btn-search-customer').addEventListener('click', findCustomerFromInput);
        }
        if (getElement('sale-customer-phone')) {
            getElement('sale-customer-phone').addEventListener('keydown', ev => {
                if (ev.key === 'Enter') {
                    findCustomerFromInput();
                }
            });
        }
        if (getElement('btn-save-quick-customer')) {
            getElement('btn-save-quick-customer').addEventListener('click', saveQuickCustomer);
        }
        if (getElement('btn-same-as-total')) {
            getElement('btn-same-as-total').addEventListener('click', () => {
                
                // Sync state from module if needed
                if (window.LitePos && window.LitePos.state && window.LitePos.state.currentSale) {
                    currentSale = window.LitePos.state.currentSale;
                }
                
                if (!currentSale) {
                    currentSale = createEmptySale();
                }
                
                // Get the total amount
                const totalAmount = currentSale.total || 0;
                
                // Set the input value
                if (getElement('input-payment')) {
                    getElement('input-payment').value = String(totalAmount);
                    
                    // Trigger the input event to update currentSale.payment and call updateSaleTotals
                    const event = new Event('input', { bubbles: true });
                    getElement('input-payment').dispatchEvent(event);
                } else {
                    console.error('[Same as Payable] Input element NOT found!');
                }
            });
        } else {
            console.error('[Event Handler] btn-same-as-total element NOT found!');
        }
        if (getElement('btn-clear-customer')) {
            getElement('btn-clear-customer').addEventListener('click', () => {
                setCurrentCustomer(null);
            });
        }

        // POS: product search
        if (getElement('product-search')) {
            getElement('product-search').addEventListener('input', renderProductSearchTable);
        }

        // POS: discount / payment inputs
        if (getElement('input-discount')) {
            getElement('input-discount').addEventListener('input', () => {
                if (!currentSale) return;
                currentSale.manualDiscount = parseMoneyInput(getElement('input-discount').value);
                if (window.LitePos?.pos?.updateSaleTotals) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.pos.updateSaleTotals();
                    currentSale = window.LitePos.state.currentSale;
                } else {
                    updateSaleTotals();
                }
            });
        }
        
        // Discount type selector
        if (getElement('discount-type')) {
            getElement('discount-type').addEventListener('change', () => {
                if (!currentSale) return;
                currentSale.manualDiscountType = getElement('discount-type').value;
                if (window.LitePos?.pos?.updateSaleTotals) {
                    window.LitePos.state.currentSale = currentSale;
                    window.LitePos.pos.updateSaleTotals();
                    currentSale = window.LitePos.state.currentSale;
                } else {
                    updateSaleTotals();
                }
            });
        }
        if (getElement('input-payment')) {
            getElement('input-payment').addEventListener('input', () => {
                if (!currentSale) return;
                currentSale.payment = parseMoneyInput(getElement('input-payment').value);
                updateSaleTotals();
            });
        }

        // POS: Payment method selection
        const paymentMethodPills = document.querySelectorAll('.payment-method-pill');
        paymentMethodPills.forEach(pill => {
            pill.addEventListener('click', function() {
                // Remove active from all
                paymentMethodPills.forEach(p => p.classList.remove('active'));
                // Add active to clicked
                this.classList.add('active');
                
                // Get selected method
                const method = this.getAttribute('data-method');
                
                // Update current sale
                if (currentSale) {
                    currentSale.payment_method = method;
                }
                
                // Show/hide payment details field (for card/bkash/nagad)
                const paymentDetailsRow = document.getElementById('payment-details-row');
                const paymentDetailsInput = document.getElementById('input-payment-details');
                if (method === 'cash') {
                    paymentDetailsRow.classList.add('hidden');
                    if (paymentDetailsInput) paymentDetailsInput.value = '';
                } else {
                    paymentDetailsRow.classList.remove('hidden');
                    // Set placeholder based on method
                    if (paymentDetailsInput) {
                        switch(method) {
                            case 'card':
                                paymentDetailsInput.placeholder = 'Card number (last 4 digits)';
                                break;
                            case 'bkash':
                                paymentDetailsInput.placeholder = 'bKash number';
                                break;
                            case 'nagad':
                                paymentDetailsInput.placeholder = 'Nagad number';
                                break;
                        }
                    }
                }
            });
        });
        
        // POS: Payment details input
        const paymentDetailsInput = document.getElementById('input-payment-details');
        if (paymentDetailsInput) {
            paymentDetailsInput.addEventListener('input', () => {
                if (currentSale) {
                    currentSale.payment_details = paymentDetailsInput.value;
                }
            });
        }

        // POS: sale controls
        if (getElement('btn-new-sale')) {
            getElement('btn-new-sale').addEventListener('click', handleNewSaleClick);
        }
        if (getElement('btn-hold-sale')) {
            getElement('btn-hold-sale').addEventListener('click', holdCurrentSale);
        }
        if (getElement('btn-cancel-sale')) {
            getElement('btn-cancel-sale').addEventListener('click', cancelCurrentSale);
        }
        if (getElement('btn-cancel-edit-sale')) {
            getElement('btn-cancel-edit-sale').addEventListener('click', () => {
                modalNotifier.show({
                    type: 'warning',
                    title: 'Cancel Sale Update',
                    message: 'Are you sure you want to cancel editing this sale? All changes will be discarded and you will start a fresh new sale.',
                    actions: [
                        {
                            label: 'Yes, cancel and start new',
                            variant: 'danger',
                            autofocus: true,
                            onClick: () => {
                                console.log('=== Cancel Sale Update confirmed ===');
                                
                                // Clear auto-save FIRST
                                if (window.LitePos?.pos?.clearAutoSave) {
                                    console.log('Clearing auto-save...');
                                    window.LitePos.pos.clearAutoSave();
                                }
                                
                                // Clear customer
                                console.log('Clearing customer...');
                                setCurrentCustomer(null);
                                
                                // Start completely fresh sale (notify=true to skip auto-save check)
                                // This handles cart clearing, UI updates, and button visibility
                                console.log('Calling startNewSale(true)...');
                                startNewSale(true);
                                
                                // DON'T call renderCartTable() - startNewSale already clears the cart
                                // Calling it here causes state sync issues and cart items reappear
                                
                                console.log('=== Cancel Sale Update complete ===');
                                showToast('Sale cancelled', 'Started a fresh new sale.', 'success');
                            }
                        },
                        {
                            label: 'Keep editing',
                            variant: 'ghost'
                        }
                    ]
                });
            });
        }
        if (getElement('btn-revert-changes')) {
            getElement('btn-revert-changes').addEventListener('click', () => {
                console.log('Revert Changes clicked', currentSale);
                if (!currentSale || !currentSale.id) {
                    console.log('No current sale or sale ID');
                    return;
                }
                
                const saleId = currentSale.id;
                const originalSale = db.sales.find(s => s.id === saleId);
                console.log('Original sale:', originalSale);
                
                if (!originalSale) {
                    showToast('Error', 'Original sale not found.', 'error');
                    return;
                }
                
                modalNotifier.show({
                    type: 'warning',
                    title: 'Revert Changes',
                    message: 'Are you sure you want to revert all changes and reload the original sale? All modifications will be lost.',
                    actions: [
                        {
                            label: 'Yes, revert changes',
                            variant: 'danger',
                            autofocus: true,
                            onClick: () => {
                                console.log('User confirmed revert');
                                // Clear auto-save to prevent interference
                                if (window.LitePos?.pos?.clearAutoSave) {
                                    window.LitePos.pos.clearAutoSave();
                                }
                                
                                // Deep clone the original sale
                                currentSale = structuredCloneSale(originalSale);
                                if (window.LitePos && window.LitePos.state) {
                                    window.LitePos.state.currentSale = currentSale;
                                }
                                
                                // Restore customer UI
                                setCurrentCustomer(currentSale.customer || null);
                                const customerPhoneInput = getElement('customer-phone-input');
                                const customerNameDisplay = getElement('customer-name-display');
                                if (customerPhoneInput) {
                                    customerPhoneInput.value = currentSale.customer?.phone || '';
                                    customerPhoneInput.disabled = !!(currentSale.customer && currentSale.customer.phone);
                                    customerPhoneInput.title = currentSale.customer ? 'Cannot change customer for existing sales' : '';
                                }
                                if (customerNameDisplay) {
                                    customerNameDisplay.textContent = currentSale.customer?.name || 'Walk-in';
                                }
                                const customerSearchBtn = getElement('btn-customer-search');
                                if (customerSearchBtn) {
                                    customerSearchBtn.disabled = !!(currentSale.customer && currentSale.customer.phone);
                                    customerSearchBtn.title = currentSale.customer ? 'Cannot change customer for existing sales' : '';
                                }
                                
                                // Restore payment method
                                const paymentMethodPills = document.querySelectorAll('.payment-method-pill');
                                paymentMethodPills.forEach(pill => {
                                    if (pill.dataset.method === (currentSale.payment_method || 'cash')) {
                                        pill.classList.add('active');
                                    } else {
                                        pill.classList.remove('active');
                                    }
                                });
                                
                                // Restore payment details
                                const paymentDetailsRow = getElement('payment-details-row');
                                const paymentDetailsInput = getElement('input-payment-details');
                                if (currentSale.payment_method && currentSale.payment_method !== 'cash') {
                                    if (paymentDetailsRow) paymentDetailsRow.classList.remove('hidden');
                                    if (paymentDetailsInput) {
                                        paymentDetailsInput.value = currentSale.payment_details || '';
                                        switch(currentSale.payment_method) {
                                            case 'card':
                                                paymentDetailsInput.placeholder = 'Card number (last 4 digits)';
                                                break;
                                            case 'bkash':
                                                paymentDetailsInput.placeholder = 'bKash number';
                                                break;
                                            case 'nagad':
                                                paymentDetailsInput.placeholder = 'Nagad number';
                                                break;
                                        }
                                    }
                                } else {
                                    if (paymentDetailsRow) paymentDetailsRow.classList.add('hidden');
                                    if (paymentDetailsInput) paymentDetailsInput.value = '';
                                }
                                
                                // Restore payment input
                                const paymentInput = getElement('input-payment');
                                if (paymentInput && currentSale.payment) {
                                    paymentInput.value = currentSale.payment || 0;
                                }
                                
                                // Update cart title
                                const cartTitle = document.getElementById('cart-title');
                                const cartSubheaderBn = document.getElementById('cart-subheader-bn');
                                const saleStatus = currentSale.status || 'open';
                                if (cartTitle) {
                                    cartTitle.textContent = saleStatus === 'closed' ? 'Editing Closed Sale' : 'Editing Sale';
                                }
                                if (cartSubheaderBn) {
                                    cartSubheaderBn.textContent = '· বিক্রয় সম্পাদনা';
                                }
                                
                                // Force complete UI refresh
                                console.log('Calling renderCartTable to restore cart...');
                                renderCartTable();
                                if (window.LitePos?.pos?.updateSaleTotals) {
                                    window.LitePos.pos.updateSaleTotals();
                                }
                                if (window.LitePos?.pos?.updateActionButtonsVisibility) {
                                    window.LitePos.pos.updateActionButtonsVisibility();
                                }
                                
                                showToast('Changes reverted', 'Original sale reloaded.', 'success');
                            }
                        },
                        {
                            label: 'Keep editing',
                            variant: 'ghost'
                        }
                    ]
                });
            });
        }
        if (getElement('btn-clear-cart')) {
            getElement('btn-clear-cart').addEventListener('click', clearCart);
        }
        // Finish editing sale
        if (getElement('btn-finish-editing')) {
            getElement('btn-finish-editing').addEventListener('click', finishEditingSale);
        }
        if (getElement('btn-complete-sale')) {
            getElement('btn-complete-sale').addEventListener('click', completeCurrentSale);
        }

        // POS: print last receipt
        if (getElement('btn-print-last-receipt')) {
            getElement('btn-print-last-receipt').addEventListener('click', printLastReceipt);
        }

        // Customers tab
        if (getElement('customer-search')) {
            getElement('customer-search').addEventListener('input', renderCustomersTable);
        }
        if (getElement('btn-save-customer-edit')) {
            getElement('btn-save-customer-edit').addEventListener('click', saveCustomerFromForm);
        }
        if (getElement('btn-new-customer')) {
            getElement('btn-new-customer').addEventListener('click', clearCustomerForm);
        }

        // Clear button handlers
        if (getElement('btn-clear-product-search')) {
            getElement('btn-clear-product-search').addEventListener('click', () => {
                if (getElement('product-search')) {
                    getElement('product-search').value = '';
                    // Focus back to input
                    getElement('product-search').focus();
                    renderProductSearchTable();
                }
            });
        }
        if (getElement('btn-clear-customer-phone')) {
            getElement('btn-clear-customer-phone').addEventListener('click', () => {
                if (getElement('sale-customer-phone')) {
                    getElement('sale-customer-phone').value = '';
                    setCurrentCustomer(null);
                    if (getElement('customer-overlay')) {
                        getElement('customer-overlay').classList.add('hidden');
                    }
                }
            });
        }

        // Products tab
        if (getElement('product-manage-search')) {
            getElement('product-manage-search').addEventListener('input', () => {
                currentProductsPage = 1; // Reset to first page on search
                renderProductsTable();
            });
        }
        if (getElement('product-filter-category')) {
            getElement('product-filter-category').addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on filter
                renderProductsTable();
            });
        }
        if (getElement('product-filter-brand')) {
            getElement('product-filter-brand').addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on filter
                renderProductsTable();
            });
        }
        if (getElement('product-filter-supplier')) {
            getElement('product-filter-supplier').addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on filter
                renderProductsTable();
            });
        }
        if (getElement('product-sort')) {
            getElement('product-sort').addEventListener('change', () => {
                currentProductsPage = 1; // Reset to first page on sort
                renderProductsTable();
            });
        }
        if (getElement('product-filter-low-stock')) {
            getElement('product-filter-low-stock').addEventListener('change', () => {
                currentProductsPage = 1;
                renderProductsTable();
            });
        }
        if (getElement('product-filter-discount')) {
            getElement('product-filter-discount').addEventListener('change', () => {
                currentProductsPage = 1;
                renderProductsTable();
            });
        }
        if (getElement('btn-product-prev-page')) {
            getElement('btn-product-prev-page').addEventListener('click', () => {
                if (currentProductsPage > 1) {
                    currentProductsPage--;
                    renderProductsTable();
                }
            });
        }
        if (getElement('btn-product-next-page')) {
            getElement('btn-product-next-page').addEventListener('click', () => {
                currentProductsPage++;
                renderProductsTable();
            });
        }
        if (getElement('btn-save-product')) {
            getElement('btn-save-product').addEventListener('click', saveProductFromForm);
        }
        if (getElement('btn-new-product')) {
            getElement('btn-new-product').addEventListener('click', clearProductForm);
        }
        if (getElement('btn-delete-product')) {
            getElement('btn-delete-product').addEventListener('click', deleteProduct);
        }
        if (getElement('btn-view-product-sales')) {
            getElement('btn-view-product-sales').addEventListener('click', () => {
                const productId = getElement('product-edit-name')?.dataset?.productId;
                if (productId && window.LitePos?.products?.viewProductSales) {
                    window.LitePos.products.viewProductSales(productId);
                }
            });
        }
        if (getElement('btn-save-stock-adjustment')) {
            getElement('btn-save-stock-adjustment').addEventListener('click', saveStockAdjustment);
        }
        if (getElement('btn-toggle-stock-updates')) {
            getElement('btn-toggle-stock-updates').addEventListener('click', (e) => {
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
        if (getElement('stock-updates-header')) {
            getElement('stock-updates-header').addEventListener('click', () => {
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
        ['sales-filter-from', 'sales-filter-to', 'sales-filter-status', 'sales-filter-user', 'sales-filter-query', 'sales-filter-payment-method']
            .forEach(id => {
                const el = els[id] || document.getElementById(id);
                if (el) {
                    el.addEventListener('input', renderSalesTable);
                    el.addEventListener('change', renderSalesTable);
                    console.log('Sales filter event listener attached for:', id);
                } else {
                    console.warn('Sales filter element not found:', id);
                }
            });
        if (getElement('btn-sales-clear-filters')) {
            getElement('btn-sales-clear-filters').addEventListener('click', clearSalesFilters);
        }

        // Reports
        if (getElement('btn-export-csv')) {
            getElement('btn-export-csv').addEventListener('click', exportCsvReport);
        }
        if (getElement('btn-print-report')) {
            getElement('btn-print-report').addEventListener('click', printReport);
        }

        // Admin: shop settings
        if (getElement('btn-save-shop-settings')) {
            getElement('btn-save-shop-settings').addEventListener('click', saveShopSettingsFromForm);
        }
        if (getElement('shop-logo-input')) {
            getElement('shop-logo-input').addEventListener('change', handleLogoUpload);
        }
        if (getElement('btn-remove-logo')) {
            getElement('btn-remove-logo').addEventListener('click', removeLogo);
        }
        
        // Admin: global settings
        if (getElement('btn-save-global-settings')) {
            getElement('btn-save-global-settings').addEventListener('click', saveGlobalSettings);
        }

        // Admin: POS settings
        if (getElement('btn-save-pos-settings')) {
            getElement('btn-save-pos-settings').addEventListener('click', savePOSSettings);
        }

        // Admin: users
        if (getElement('btn-save-user')) {
            getElement('btn-save-user').addEventListener('click', saveUserFromForm);
        }
        if (getElement('btn-new-user')) {
            getElement('btn-new-user').addEventListener('click', clearUserForm);
        }

        // Admin: backup/restore
        if (getElement('btn-backup-download')) {
            getElement('btn-backup-download').addEventListener('click', () => {
                if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.downloadBackup === 'function') {
                    window.LitePos.admin.downloadBackup(); // Plain backup (no password)
                } else {
                    downloadBackup();
                }
            });
        }
        if (getElement('btn-backup-download-encrypted')) {
            getElement('btn-backup-download-encrypted').addEventListener('click', () => {
                const password = prompt('Enter a strong password to encrypt your backup:\n\n⚠️ IMPORTANT: Remember this password!\nYou will need it to restore the backup.\nIt cannot be recovered if lost.');
                
                if (!password) {
                    if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.showToast === 'function') {
                        window.LitePos.ui.showToast('Cancelled', 'Encrypted backup cancelled.', 'error');
                    }
                    return;
                }
                
                if (password.length < 8) {
                    if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.showToast === 'function') {
                        window.LitePos.ui.showToast('Weak Password', 'Password must be at least 8 characters long.', 'error');
                    }
                    return;
                }
                
                const confirmPassword = prompt('Confirm your password:');
                if (password !== confirmPassword) {
                    if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.showToast === 'function') {
                        window.LitePos.ui.showToast('Password Mismatch', 'Passwords do not match.', 'error');
                    }
                    return;
                }
                
                if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.downloadBackup === 'function') {
                    window.LitePos.admin.downloadBackup(password);
                } else {
                    downloadBackup(password);
                }
            });
        }
        if (getElement('backup-file-input')) {
            getElement('backup-file-input').addEventListener('change', (ev) => {
                if (window.LitePos && window.LitePos.admin && typeof window.LitePos.admin.handleRestoreFile === 'function') {
                    window.LitePos.admin.handleRestoreFile(ev);
                } else {
                    handleRestoreFile(ev);
                }
            });
        }

        // Clean up print classes after printing
        window.addEventListener('afterprint', () => {
            document.body.classList.remove('print-receipt', 'print-report', 'receipt-a4', 'receipt-80mm', 'receipt-58mm');
        });
    }

    function handleKeyShortcuts(ev) {
        const inMainScreen = !getElement('main-screen').classList.contains('hidden');

        if (inMainScreen && ev.altKey) {
            ev.preventDefault(); // Prevent browser default Alt key behavior
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
                if (id === tabId) {
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
                // Initialize receipt size from global settings
                if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.initReceiptSize === 'function') {
                    window.LitePos.pos.initReceiptSize();
                }
                focusSaleProductSearchInput();
                break;
            case 'tab-customers':
                renderCustomersTable();
                break;
            case 'tab-products':
                renderProductsTable();
                break;
            case 'tab-sales':
                prepareSalesFiltersIfEmpty();
                populateSalespersonFilter();
                renderSalesTable();
                break;
            case 'tab-reports':
                refreshKpis();
                drawSalesChart();
                break;
            case 'tab-admin':
                loadShopForm();
                loadGlobalSettings();
                loadPOSSettings();
                renderUsersTable();
                populateSalespersonFilter();
                break;
        }
    }

    // -------------------------
    // POS: CUSTOMER
    // -------------------------

    function findCustomerFromInput() {
        if (window.LitePos?.customers?.findCustomerFromInput) {
            return window.LitePos.customers.findCustomerFromInput();
        }
        console.error('findCustomerFromInput: customers module not loaded');
    }

    function setCurrentCustomer(customer) {
        if (window.LitePos?.customers?.setCurrentCustomer) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.customers.setCurrentCustomer(customer);
            if (window.LitePos.state?.currentSale) {
                currentSale = window.LitePos.state.currentSale;
            }
            if (window.LitePos.pos?.autoSaveCurrentSale) {
                window.LitePos.pos.autoSaveCurrentSale();
            }
            return;
        }
        console.error('setCurrentCustomer: customers module not loaded');
    }

    function saveQuickCustomer() {
        if (window.LitePos?.customers?.saveQuickCustomer) {
            return window.LitePos.customers.saveQuickCustomer();
        }
        console.error('saveQuickCustomer: customers module not loaded');
    }

    function focusSaleProductSearchInput() {
        const el = getElement('product-search');
        if (el) {
            el.focus();
            el.select();
        }
    }

    function focusCustomerPhone() {
        if (window.LitePos?.customers?.focusCustomerPhone) {
            return window.LitePos.customers.focusCustomerPhone();
        }
        console.error('focusCustomerPhone: customers module not loaded');
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
        if (window.LitePos?.pos?.createEmptySale) {
            return window.LitePos.pos.createEmptySale();
        }
        console.error('createEmptySale: pos module not loaded');
        return null;
    }

    function startNewSale(notify) {
        console.log('[startNewSale wrapper] Called with notify:', notify);
        console.log('[startNewSale wrapper] Before - currentSale.items:', currentSale?.items?.length || 0);
        if (window.LitePos?.pos?.startNewSale) {
            window.LitePos.pos.startNewSale(notify);
            if (window.LitePos.state?.currentSale) {
                console.log('[startNewSale wrapper] Syncing currentSale from state.currentSale');
                console.log('[startNewSale wrapper] state.currentSale.items:', window.LitePos.state.currentSale.items.length);
                currentSale = window.LitePos.state.currentSale;
                console.log('[startNewSale wrapper] After sync - currentSale.items:', currentSale.items.length);
            }
            return;
        }
        console.error('startNewSale: pos module not loaded');
    }

    function clearCart() {
        if (window.LitePos?.pos?.clearCart) {
            if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
            window.LitePos.pos.clearCart();
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('clearCart: pos module not loaded');
    }

    function finishEditingSale() {
        if (window.LitePos?.pos?.finishEditingSale) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.finishEditingSale();
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('finishEditingSale: pos module not loaded');
    }

    function clampDiscount() {
        if (window.LitePos?.pos?.clampDiscount) {
            if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
            window.LitePos.pos.clampDiscount();
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('clampDiscount: pos module not loaded');
    }

    function updateSaleTotals() {
        if (window.LitePos?.pos?.updateSaleTotals) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.updateSaleTotals();
            if (window.LitePos.state?.currentSale) {
                currentSale = window.LitePos.state.currentSale;
            }
            return;
        }
        console.error('updateSaleTotals: pos module not loaded');
    }

    function syncCartUiState(hasItems, meta = {}) {
        const cartTableWrapper = getElement('cart-table-wrapper') || document.getElementById('cart-table-wrapper');
        const emptyState = getElement('cart-empty-state') || document.getElementById('cart-empty-state');
        const countChip = getElement('cart-count-chip') || document.getElementById('cart-count-chip');
        const actionsRow = getElement('sale-actions-row') || document.getElementById('sale-actions-row');
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
        console.log('[renderCartTable wrapper] Called');
        console.log('[renderCartTable wrapper] Before sync - currentSale.items:', currentSale?.items?.length || 0);
        if (window.LitePos?.pos?.renderCartTable) {
            if (window.LitePos.state) {
                console.log('[renderCartTable wrapper] Syncing state.currentSale FROM currentSale');
                window.LitePos.state.currentSale = currentSale;
            }
            window.LitePos.pos.renderCartTable();
            if (window.LitePos.state?.currentSale) {
                console.log('[renderCartTable wrapper] Syncing currentSale FROM state.currentSale');
                console.log('[renderCartTable wrapper] state.currentSale.items:', window.LitePos.state.currentSale.items.length);
                currentSale = window.LitePos.state.currentSale;
                console.log('[renderCartTable wrapper] After sync - currentSale.items:', currentSale.items.length);
            }
            return;
        }
        console.error('renderCartTable: pos module not loaded');
    }

    function changeCartQty(index, delta) {
        if (window.LitePos?.pos?.changeCartQty) {
            if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
            window.LitePos.pos.changeCartQty(index, delta);
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('changeCartQty: pos module not loaded');
    }

    function removeCartItem(index) {
        if (window.LitePos?.pos?.removeCartItem) {
            if (window.LitePos.state) window.LitePos.state.currentSale = currentSale;
            window.LitePos.pos.removeCartItem(index);
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('removeCartItem: pos module not loaded');
    }

    function addProductToCart(skuOrBarcode) {
        if (window.LitePos?.pos?.addProductToCart) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.addProductToCart(skuOrBarcode);
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            resetProductSearchAfterAdd();
            return;
        }
        console.error('addProductToCart: pos module not loaded');
    }

    function resetProductSearchAfterAdd() {
        let needsRender = false;
        if (getElement('product-search')) {
            if (getElement('product-search').value !== '') needsRender = true;
            getElement('product-search').value = '';
            getElement('product-search').focus();
        }
        if (getElement('product-overlay')) {
            getElement('product-overlay').classList.add('hidden');
        }
        if (needsRender) {
            renderProductSearchTable();
        }
    }

    // -------------------------
    // POS: PRODUCT SEARCH TABLE
    // -------------------------

    function renderProductSearchTable() {
        if (window.LitePos?.products?.renderProductSearchTable) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            return window.LitePos.products.renderProductSearchTable();
        }
        console.error('renderProductSearchTable: products module not loaded');
    }

    window.renderProductSearchTable = renderProductSearchTable;

    function focusProductSearch() {
        if (window.LitePos?.products?.focusProductSearch) {
            return window.LitePos.products.focusProductSearch();
        }
        console.error('focusProductSearch: products module not loaded');
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
        if (window.LitePos?.pos?.holdCurrentSale) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.holdCurrentSale();
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            renderCartTable();
            updateSaleTotals();
            renderOpenSalesStrip();
            return;
        }
        console.error('holdCurrentSale: pos module not loaded');
    }

    function cancelCurrentSale() {
        if (window.LitePos?.pos?.cancelCurrentSale) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.cancelCurrentSale();
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('cancelCurrentSale: pos module not loaded');
    }

    function completeCurrentSale() {
        if (window.LitePos?.pos?.completeCurrentSale) {
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
        }
        console.error('completeCurrentSale: pos module not loaded');
    }

    function structuredCloneSale(s) {
        return JSON.parse(JSON.stringify(s));
    }

    function renderOpenSalesStrip() {
        const container = getElement('open-sales-list');
        const card = document.getElementById('open-sales-card');
        if (!container || !card) return;
        container.innerHTML = '';
        const activeSaleId = currentSale && currentSale.id ? currentSale.id : null;
        const openSales = db.sales.filter(s => s.status === 'open' && (!activeSaleId || s.id !== activeSaleId));
        
        // Hide card if no open sales
        if (openSales.length === 0) {
            if (card) card.classList.add('hidden');
            if (getElement('kpi-open-sales')) {
                getElement('kpi-open-sales').textContent = '0';
            }
            return;
        }
        
        // Show card if we have open sales
        if (card) card.classList.remove('hidden');
        if (getElement('kpi-open-sales')) {
            getElement('kpi-open-sales').textContent = String(openSales.length);
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
        
        const modalNotifier = window.LitePos?.ui?.modalNotifier;
        if (!modalNotifier) {
            if (!confirm(`Cancel open sale ${saleId}? This cannot be undone.`)) {
                return;
            }
            db.sales.splice(idx, 1);
            saveDb();
            renderOpenSalesStrip();
            showToast('Sale cancelled', `Sale ${saleId} removed.`, 'success');
            return;
        }
        
        modalNotifier.show({
            type: 'warning',
            title: 'Cancel Open Sale',
            message: `Are you sure you want to cancel sale ${saleId}? This action cannot be undone.`,
            actions: [
                {
                    label: 'Yes, cancel sale',
                    variant: 'danger',
                    autofocus: true,
                    onClick: () => {
                        db.sales.splice(idx, 1);
                        saveDb();
                        renderOpenSalesStrip();
                        showToast('Sale cancelled', `Sale ${saleId} removed.`, 'success');
                    }
                },
                {
                    label: 'Keep sale',
                    variant: 'ghost'
                }
            ]
        });
    }

    function loadOpenSale(saleId) {
        if (window.LitePos?.pos?.loadOpenSale) {
            if (window.LitePos.state) {
                window.LitePos.state.currentSale = currentSale;
                window.LitePos.state.db = db;
            }
            window.LitePos.pos.loadOpenSale(saleId);
            if (window.LitePos.state?.currentSale) currentSale = window.LitePos.state.currentSale;
            return;
        }
        console.error('loadOpenSale: pos module not loaded');
    }

    function loadSaleForEditing(saleId) {
        const sale = db.sales.find(s => s.id === saleId);
        if (!sale) {
            return showToast('Edit sale', 'Sale not found.', 'error');
        }

        const activeSaleId = currentSale && currentSale.id ? currentSale.id : null;
        const activeHasItems = currentSale && Array.isArray(currentSale.items) && currentSale.items.length > 0;
        
        if (activeSaleId === saleId) {
            switchTab('tab-sale');
            return showToast('Edit sale', `Sale ${saleId} is already loaded for editing.`, 'info');
        }

        if (activeHasItems && activeSaleId && activeSaleId !== saleId) {
            const modalNotifier = window.LitePos?.ui?.modalNotifier;
            if (!modalNotifier) {
                if (!confirm(`Save current sale ${activeSaleId} before editing ${saleId}?`)) {
                    return;
                }
                persistSaleAsOpen(currentSale);
            } else {
                modalNotifier.show({
                    type: 'info',
                    title: 'Save Current Sale',
                    message: `Save current sale ${activeSaleId} before editing sale ${saleId}?`,
                    actions: [
                        {
                            label: 'Yes, save & continue',
                            variant: 'primary',
                            autofocus: true,
                            onClick: () => {
                                persistSaleAsOpen(currentSale);
                                // Continue with the edit after save
                                setTimeout(() => loadSaleForEditing(saleId), 100);
                            }
                        },
                        {
                            label: 'Cancel',
                            variant: 'ghost'
                        }
                    ]
                });
                return;
            }
        }

        currentSale = structuredCloneSale(sale);
        if (window.LitePos && window.LitePos.state) {
            window.LitePos.state.currentSale = currentSale;
        }
        setCurrentCustomer(currentSale.customer || null);
        
        // Load payment method and details into UI
        const paymentMethodPills = document.querySelectorAll('.payment-method-pill');
        if (paymentMethodPills) {
            paymentMethodPills.forEach(pill => {
                if (pill.dataset.method === (currentSale.payment_method || 'cash')) {
                    pill.classList.add('active');
                } else {
                    pill.classList.remove('active');
                }
            });
        }
        
        // Show payment details field if method is not cash
        const paymentDetailsRow = document.getElementById('payment-details-row');
        const paymentDetailsInput = document.getElementById('input-payment-details');
        if (paymentDetailsRow && paymentDetailsInput) {
            if (currentSale.payment_method && currentSale.payment_method !== 'cash') {
                paymentDetailsRow.classList.remove('hidden');
                paymentDetailsInput.value = currentSale.payment_details || '';
                // Set placeholder based on method
                switch(currentSale.payment_method) {
                    case 'card':
                        paymentDetailsInput.placeholder = 'Card number (last 4 digits)';
                        break;
                    case 'bkash':
                        paymentDetailsInput.placeholder = 'bKash number';
                        break;
                    case 'nagad':
                        paymentDetailsInput.placeholder = 'Nagad number';
                        break;
                }
            } else {
                paymentDetailsRow.classList.add('hidden');
                paymentDetailsInput.value = '';
            }
        }
        
        // Disable customer change if sale has a customer
        const customerPhoneInput = document.getElementById('customer-phone-input');
        const customerSearchBtn = document.getElementById('btn-customer-search');
        if (currentSale.customer && currentSale.customer.phone) {
            if (customerPhoneInput) {
                customerPhoneInput.disabled = true;
                customerPhoneInput.title = 'Cannot change customer for existing sales';
            }
            if (customerSearchBtn) {
                customerSearchBtn.disabled = true;
                customerSearchBtn.title = 'Cannot change customer for existing sales';
            }
        } else {
            if (customerPhoneInput) {
                customerPhoneInput.disabled = false;
                customerPhoneInput.title = '';
            }
            if (customerSearchBtn) {
                customerSearchBtn.disabled = false;
                customerSearchBtn.title = '';
            }
        }
        
        renderCartTable();
        updateSaleTotals();
        
        // Update cart title to show "Editing Sale"
        const cartTitleEl = document.getElementById('cart-title-text');
        if (cartTitleEl) {
            const statusLabel = sale.status === 'closed' ? 'Editing Closed Sale' : 'Editing Sale';
            cartTitleEl.textContent = statusLabel;
        }
        
        const statusLabel = sale.status === 'closed' ? 'Editing Closed Sale' : (sale.status === 'open' ? 'Editing Open Sale' : 'Editing Sale');
        getElement('summary-sale-status').textContent = `${statusLabel} · ${sale.id}`;
        if (getElement('summary-sale-id-value')) getElement('summary-sale-id-value').textContent = sale.id;
        
        // Update action buttons visibility
        if (window.LitePos?.pos?.updateActionButtonsVisibility) {
            window.LitePos.pos.updateActionButtonsVisibility();
        }
        
        switchTab('tab-sale');
        focusProductSearch();
        showToast('Edit mode', `Editing sale ${sale.id}. Changes will update the original.`, 'success');
    }

    window.loadSaleForEditing = loadSaleForEditing;

    // -------------------------
    // POS: RECEIPT
    // -------------------------

    function fillReceiptFromSale(sale) {
        if (window.LitePos?.pos?.fillReceiptFromSale) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            window.LitePos.pos.fillReceiptFromSale(sale);
            return;
        }
        console.error('fillReceiptFromSale: pos module not loaded');
    }

    function printLastReceipt() {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.printLastReceipt === 'function') {
            try {
                if (window.LitePos.state) window.LitePos.state.db = db;
                window.LitePos.pos.printLastReceipt();
                return;
            } catch (e) { console.error(e); }
        }
        
        // If editing a sale, print the current sale
        const isEditing = currentSale && currentSale.id && db.sales.some(s => s.id === currentSale.id);
        if (isEditing) {
            fillReceiptFromSale(currentSale);
        } else {
            // Print last closed sale
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
        }

        const size = getElement('receipt-size').value || 'a4';
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
        if (window.LitePos?.customers?.renderCustomersTable) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            return window.LitePos.customers.renderCustomersTable();
        }
        console.error('[core.js] renderCustomersTable: customers module not loaded');
    }

    function loadCustomerToForm(id) {
        if (window.LitePos?.customers?.loadCustomerToForm) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            return window.LitePos.customers.loadCustomerToForm(id);
        }
        console.error('[core.js] loadCustomerToForm: customers module not loaded');
    }

    function clearCustomerForm() {
        if (window.LitePos?.customers?.clearCustomerForm) {
            return window.LitePos.customers.clearCustomerForm();
        }
        console.error('[core.js] clearCustomerForm: customers module not loaded');
    }

    function saveCustomerFromForm() {
        if (window.LitePos?.customers?.saveCustomerFromForm) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            window.LitePos.customers.saveCustomerFromForm();
            if (window.LitePos.state?.db) db = window.LitePos.state.db;
            return;
        }
        console.error('[core.js] saveCustomerFromForm: customers module not loaded');
    }

    // -------------------------
    // PRODUCTS TAB
    // -------------------------

    function renderProductsTable() {
        if (window.LitePos?.products?.renderProductsTable) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            return window.LitePos.products.renderProductsTable();
        }
        console.error('[core.js] renderProductsTable: products module not loaded');
    }
    
    function updateCategorySuggestions() {
        if (window.LitePos?.products?.updateCategorySuggestions) {
            return window.LitePos.products.updateCategorySuggestions();
        }
    }

    function updateBrandSuggestions() {
        if (window.LitePos?.products?.updateBrandSuggestions) {
            return window.LitePos.products.updateBrandSuggestions();
        }
    }

    function updateSupplierSuggestions() {
        if (window.LitePos?.products?.updateSupplierSuggestions) {
            return window.LitePos.products.updateSupplierSuggestions();
        }
    }

    function loadProductToForm(id) {
        if (window.LitePos?.products?.loadProductToForm) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            return window.LitePos.products.loadProductToForm(id);
        }
        console.error('[core.js] loadProductToForm: products module not loaded');
    }

    function clearProductForm() {
        if (window.LitePos?.products?.clearProductForm) {
            return window.LitePos.products.clearProductForm();
        }
        console.error('[core.js] clearProductForm: products module not loaded');
    }

    function deleteProduct() {
        const productId = getElement('product-edit-name').dataset.productId;
        if (!productId) {
            return showToast('Error', 'No product selected to delete.', 'error');
        }
        
        const product = db.products.find(p => p.id === productId);
        if (!product) {
            return showToast('Error', 'Product not found.', 'error');
        }
        
        // Ask for confirmation
        const modalNotifier = window.LitePos?.ui?.modalNotifier;
        if (!modalNotifier) {
            const confirmed = confirm(`Are you sure you want to delete "${product.name}" (SKU: ${product.sku})?\n\nThis action cannot be undone.`);
            if (!confirmed) {
                return;
            }
            
            const index = db.products.findIndex(p => p.id === productId);
            if (index !== -1) {
                db.products.splice(index, 1);
            }
            
            if (db.stock_updates) {
                db.stock_updates = db.stock_updates.filter(u => u.productId !== productId);
            }
            
            saveDb();
            renderProductsTable();
            renderProductSearchTable();
            clearProductForm();
            showToast('Product Deleted', `${product.name} has been removed.`, 'success');
            return;
        }
        
        modalNotifier.show({
            type: 'danger',
            title: 'Delete Product',
            message: `Are you sure you want to delete "${product.name}" (SKU: ${product.sku})?\n\nThis action cannot be undone.`,
            actions: [
                {
                    label: 'Yes, delete product',
                    variant: 'danger',
                    autofocus: true,
                    onClick: () => {
                        const index = db.products.findIndex(p => p.id === productId);
                        if (index !== -1) {
                            db.products.splice(index, 1);
                        }
                        
                        if (db.stock_updates) {
                            db.stock_updates = db.stock_updates.filter(u => u.productId !== productId);
                        }
                        
                        saveDb();
                        renderProductsTable();
                        renderProductSearchTable();
                        clearProductForm();
                        showToast('Product Deleted', `${product.name} has been removed.`, 'success');
                    }
                },
                {
                    label: 'Cancel',
                    variant: 'ghost'
                }
            ]
        });
    }

    function saveProductFromForm() {
        if (window.LitePos?.products?.saveProductFromForm) {
            if (window.LitePos.state) window.LitePos.state.db = db;
            window.LitePos.products.saveProductFromForm();
            if (window.LitePos.state?.db) db = window.LitePos.state.db;
            return;
        }
        console.error('[core.js] saveProductFromForm: products module not loaded');
    }
    
    // -------------------------
    // STOCK ADJUSTMENTS
    // -------------------------
    
    function saveStockAdjustment() {
        const productId = getElement('product-edit-name').dataset.productId;
        if (!productId) {
            return showToast('Error', 'No product selected.', 'error');
        }
        
        const product = db.products.find(p => p.id === productId);
        if (!product) {
            return showToast('Error', 'Product not found.', 'error');
        }
        
        const qtyChange = parseInt(getElement('stock-adjustment-qty').value || '0', 10);
        const date = getElement('stock-adjustment-date').value || new Date().toISOString().split('T')[0];
        const note = (getElement('stock-adjustment-note').value || '').trim();
        
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
        if (getElement('stock-current-value')) {
            getElement('stock-current-value').textContent = newStock;
        }
        if (getElement('product-edit-stock')) {
            getElement('product-edit-stock').value = newStock;
        }
        
        // Clear adjustment form
        if (getElement('stock-adjustment-qty')) getElement('stock-adjustment-qty').value = '';
        if (getElement('stock-adjustment-note')) getElement('stock-adjustment-note').value = '';
        if (getElement('stock-adjustment-date')) {
            getElement('stock-adjustment-date').value = new Date().toISOString().split('T')[0];
        }
        
        showToast('Stock Updated', `${qtyChange > 0 ? '+' : ''}${qtyChange} units. New stock: ${newStock}`, 'success');
    }
    
    function renderStockUpdatesTable(productId) {
        
        // Use getElementById to ensure we get the element even if cache is stale
        const tbody = document.getElementById('stock-updates-table-body');
        const body = document.getElementById('stock-updates-body');
        const btn = document.getElementById('btn-toggle-stock-updates');
             
        if (!tbody) {
            console.error('[STOCK HISTORY] tbody element NOT FOUND!');
            return;
        }
        tbody.innerHTML = '';
        
        if (!db.stock_updates) db.stock_updates = [];
        
        const updates = db.stock_updates
            .filter(u => u.productId === productId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (updates.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.textContent = 'No stock adjustments yet.';
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-soft)';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }
        
        // Auto-expand the table if there are updates  
        if (body && btn && updates.length > 0) {
            body.style.display = 'block';
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>Collapse';          
        }
        
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
    }

    // -------------------------
    // SALES TAB
    // -------------------------

    function prepareSalesFiltersIfEmpty() {
        if (window.LitePos?.sales?.prepareSalesFiltersIfEmpty) {
            return window.LitePos.sales.prepareSalesFiltersIfEmpty();
        }
        console.error('prepareSalesFiltersIfEmpty: sales module not loaded');
    }

    function populateSalespersonFilter() {
        if (window.LitePos?.sales?.populateSalespersonFilter) {
            return window.LitePos.sales.populateSalespersonFilter();
        }
        console.error('populateSalespersonFilter: sales module not loaded');
    }

    function clearSalesFilters() {
        if (window.LitePos?.sales?.clearSalesFilters) {
            return window.LitePos.sales.clearSalesFilters();
        }
        console.error('clearSalesFilters: sales module not loaded');
    }

    function renderSalesTable() {
        if (window.LitePos?.sales?.renderSalesTable) {
            return window.LitePos.sales.renderSalesTable();
        }
        console.error('renderSalesTable: sales module not loaded');
    }

    function computeProfitForSale(sale) {
        if (window.LitePos?.sales?.computeProfitForSale) {
            return window.LitePos.sales.computeProfitForSale(sale);
        }
        console.error('computeProfitForSale: sales module not loaded');
        return 0;
    }

    // -------------------------
    // REPORTS / KPIs / CHART
    // -------------------------

    function refreshKpis() {
        if (window.LitePos?.reports?.refreshKpis) {
            return window.LitePos.reports.refreshKpis();
        }
        console.error('refreshKpis: reports module not loaded');
    }

    function renderTodaySnapshot() {
        if (window.LitePos?.reports?.renderTodaySnapshot) {
            return window.LitePos.reports.renderTodaySnapshot();
        }
        console.error('renderTodaySnapshot: reports module not loaded');
    }

    function drawSalesChart() {
        if (window.LitePos?.reports?.drawSalesChart) {
            return window.LitePos.reports.drawSalesChart();
        }
        console.error('drawSalesChart: reports module not loaded');
    }

    function exportCsvReport() {
        if (window.LitePos?.reports?.exportCsvReport) {
            return window.LitePos.reports.exportCsvReport();
        }
        console.error('exportCsvReport: reports module not loaded');
    }

    function printReport() {
        if (window.LitePos?.reports?.printReport) {
            return window.LitePos.reports.printReport();
        }
        console.error('printReport: reports module not loaded');
    }

    // -------------------------
    // ADMIN: SHOP SETTINGS
    // -------------------------

    function loadShopForm() {
        if (window.LitePos?.admin?.loadShopForm) {
            return window.LitePos.admin.loadShopForm();
        }
        console.error('loadShopForm: admin module not loaded');
    }

    function saveShopSettingsFromForm() {
        if (window.LitePos?.admin?.saveShopSettingsFromForm) {
            return window.LitePos.admin.saveShopSettingsFromForm();
        }
        console.error('saveShopSettingsFromForm: admin module not loaded');
    }

    function handleLogoUpload(ev) {
        if (window.LitePos?.admin?.handleLogoUpload) {
            return window.LitePos.admin.handleLogoUpload(ev);
        }
        console.error('handleLogoUpload: admin module not loaded');
    }

    function removeLogo() {
        if (window.LitePos?.admin?.removeLogo) {
            return window.LitePos.admin.removeLogo();
        }
        console.error('removeLogo: admin module not loaded');
    }

    function loadGlobalSettings() {
        if (window.LitePos?.admin?.loadGlobalSettings) {
            return window.LitePos.admin.loadGlobalSettings();
        }
        console.error('loadGlobalSettings: admin module not loaded');
    }

    function loadPOSSettings() {
        if (window.LitePos?.admin?.loadPOSSettings) {
            return window.LitePos.admin.loadPOSSettings();
        }
        console.error('loadPOSSettings: admin module not loaded');
    }

    function saveGlobalSettings() {
        if (window.LitePos?.admin?.saveGlobalSettings) {
            return window.LitePos.admin.saveGlobalSettings();
        }
        console.error('saveGlobalSettings: admin module not loaded');
    }

    function savePOSSettings() {
        if (window.LitePos?.admin?.savePOSSettings) {
            return window.LitePos.admin.savePOSSettings();
        }
        console.error('savePOSSettings: admin module not loaded');
    }

    // -------------------------
    // ADMIN: USERS
    // -------------------------

    function renderUsersTable() {
        if (window.LitePos?.admin?.renderUsersTable) {
            return window.LitePos.admin.renderUsersTable();
        }
        console.error('renderUsersTable: admin module not loaded');
    }

    function loadUserToForm(id) {
        if (window.LitePos?.admin?.loadUserToForm) {
            return window.LitePos.admin.loadUserToForm(id);
        }
        console.error('loadUserToForm: admin module not loaded');
    }

    function clearUserForm() {
        if (window.LitePos?.admin?.clearUserForm) {
            return window.LitePos.admin.clearUserForm();
        }
        console.error('clearUserForm: admin module not loaded');
    }

    function saveUserFromForm() {
        if (window.LitePos?.admin?.saveUserFromForm) {
            return window.LitePos.admin.saveUserFromForm();
        }
        console.error('saveUserFromForm: admin module not loaded');
    }

    // -------------------------
    // ADMIN: BACKUP / RESTORE
    // -------------------------

    function downloadBackup() {
        if (window.LitePos?.admin?.downloadBackup) {
            return window.LitePos.admin.downloadBackup();
        }
        console.error('downloadBackup: admin module not loaded');
    }

    function handleRestoreFile(ev) {
        if (window.LitePos?.admin?.handleRestoreFile) {
            return window.LitePos.admin.handleRestoreFile(ev);
        }
        console.error('handleRestoreFile: admin module not loaded');
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
        const container = getElement('toast-container');
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
    window.renderStockUpdatesTable = renderStockUpdatesTable;

})();
