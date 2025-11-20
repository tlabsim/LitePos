// app/modules/ui.js
(function () {
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    ns.ui = ns.ui || {};
    ns.state = ns.state || {};

    ns.ui.cacheElements = function () {
        const ids = [
            'login-screen', 'main-screen',
            'header-shop-name', 'header-shop-address', 'header-shop-phone',
            'header-user-label', 'header-user-role', 'header-session-pill',
            'btn-logout',
            'setup-panel', 'signin-panel',
            'setup-name', 'setup-username', 'setup-pin', 'setup-pin-confirm',
            'btn-setup-create',
            'login-user', 'login-pin', 'btn-login',
            'tab-sale', 'tab-customers', 'tab-products', 'tab-sales', 'tab-reports', 'tab-admin',
            'sale-customer-phone', 'sale-customer-name', 'btn-search-customer',
            'summary-customer-name', 'summary-customer-meta', 'summary-customer-status', 'summary-customer-badge',
            'quick-customer-name', 'quick-customer-notes', 'btn-save-quick-customer',
            'btn-clear-customer', 'btn-clear-product-search', 'btn-clear-customer-phone',
            'product-search', 'product-table-body', 'product-overlay', 'product-overlay-body', 'toggle-all-products',
            'customer-overlay', 'customer-overlay-body',
            'cart-table-body', 'cart-table-wrapper', 'cart-empty-state', 'cart-count-chip', 'sale-actions-row',
            'btn-new-sale', 'btn-hold-sale', 'btn-cancel-sale', 'btn-clear-cart',
            'open-sales-list', 'input-discount', 'input-payment', 'btn-same-as-total',
            'summary-subtotal', 'summary-total', 'summary-items-count', 'summary-change', 'summary-sale-status', 'summary-sale-id-value',
            'btn-complete-sale', 'receipt-size', 'btn-print-last-receipt',
            'today-summary-small', 'today-salesperson-name', 'today-last-sale', 'sale-header-total',
            'btn-toggle-keyboard-help', 'keyboard-help-body',
            'receipt-print', 'receipt-shop-name', 'receipt-shop-address', 'receipt-shop-phone',
            'receipt-sale-meta', 'receipt-items-body', 'receipt-subtotal', 'receipt-discount', 'receipt-total', 'receipt-payment', 'receipt-change',
            'customer-search', 'customers-table-body', 'customer-edit-name', 'customer-edit-phone', 'customer-edit-notes', 'btn-save-customer-edit', 'btn-new-customer',
            'product-manage-search', 'products-table-body', 'product-edit-name', 'product-edit-sku', 'product-edit-barcode', 'product-edit-category', 'product-edit-buy', 'product-edit-sell', 'product-edit-stock', 'product-edit-low', 'btn-save-product', 'btn-new-product', 'btn-delete-product',
            'product-filter-category', 'product-sort', 'product-page-info', 'btn-product-prev-page', 'btn-product-next-page', 'category-suggestions', 'product-total-count', 'product-filter-low-stock', 'product-count-badge',
            'stock-adjustment-card', 'stock-current-value', 'stock-adjustment-qty', 'stock-adjustment-date', 'stock-adjustment-note', 'btn-save-stock-adjustment',
            'stock-updates-card', 'stock-updates-header', 'btn-toggle-stock-updates', 'stock-updates-body', 'stock-updates-table-body',
            'sales-filter-from', 'sales-filter-to', 'sales-filter-status', 'sales-filter-user', 'sales-filter-query', 'btn-sales-clear-filters', 'sales-table-body',
            'kpi-total-sales', 'kpi-total-sales-count', 'kpi-today-sales', 'kpi-today-sales-count', 'kpi-total-profit', 'kpi-profit-margin', 'kpi-customers-count', 'kpi-open-sales', 'salesChart', 'report-from', 'report-to', 'btn-export-csv', 'btn-print-report', 'report-print-area', 'report-print-period', 'report-print-body',
            'shop-name', 'shop-address', 'shop-phone', 'btn-save-shop-settings', 'users-table-body', 'user-edit-name', 'user-edit-username', 'user-edit-pin', 'user-edit-role', 'btn-save-user', 'btn-new-user', 'btn-backup-download', 'backup-file-input', 'toast-container'
        ];

        ns.elements = ns.elements || {};
        ids.forEach(id => {
            ns.elements[id] = document.getElementById(id);
        });
        ns.elements.navButtons = Array.from(document.querySelectorAll('.nav-btn')) || [];
        ns.elements.navAdminButtons = Array.from(document.querySelectorAll('.nav-admin-only')) || [];
    };

    ns.ui.showToast = function (title, message, type) {
        const container = (ns.elements && ns.elements['toast-container']) || document.body;
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
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(4px)'; }, 2800);
        setTimeout(() => { if (toast.parentNode === container) container.removeChild(toast); }, 3400);
    };

    ns.ui.loadShopIntoHeader = function () {
        const els = ns.elements || {};
        if (!ns.state.db) return;
        els['header-shop-name'] && (els['header-shop-name'].textContent = ns.state.db.shop.name || 'LitePOS');
        els['header-shop-address'] && (els['header-shop-address'].textContent = ns.state.db.shop.address || '');
        els['header-shop-phone'] && (els['header-shop-phone'].textContent = ns.state.db.shop.phone || '');
        if (ns.state.currentUser) {
            els['header-user-label'] && (els['header-user-label'].textContent = ns.state.currentUser.name);
            els['header-user-role'] && (els['header-user-role'].textContent = ns.state.currentUser.role === 'superadmin' ? 'Superadmin' : 'Sales');
        }
    };

    ns.ui.applyRoleUI = function () {
        const isSuperadmin = ns.state.currentUser && ns.state.currentUser.role === 'superadmin';
        const adminBtns = ns.elements && ns.elements.navAdminButtons ? ns.elements.navAdminButtons : [];
        adminBtns.forEach(btn => { btn.style.display = isSuperadmin ? 'flex' : 'none'; });
    };

    // Keyboard help toggle (collapsible)
    document.addEventListener('click', (ev) => {
        const btn = document.getElementById('btn-toggle-keyboard-help');
        if (!btn) return;
        if (ev.target === btn || btn.contains(ev.target)) {
            const wrapper = btn.closest('.keyboard-help');
            if (!wrapper) return;
            const collapsed = wrapper.classList.toggle('collapsed');
            btn.setAttribute('aria-expanded', (!collapsed).toString());
            btn.textContent = collapsed ? 'Show' : 'Hide';
        }
    });

})();
