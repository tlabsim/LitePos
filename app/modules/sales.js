/* Sales module for LitePos
   Extracted functions for sales filters and rendering, exposes window.LitePos.sales
*/
(function () {
    'use strict';

    window.LitePos = window.LitePos || {};
    const API = window.LitePos.api || {};
    const UTILS = window.LitePos.utils || {};
    const UI = window.LitePos.ui || {};
    window.LitePos.state = window.LitePos.state || {};
    const state = window.LitePos.state;

    function _getDb() { return state.db || (window.db || {}); }
    function _getEls() { return window.LitePos.elements || {}; }
    function _showToast(title, msg, type) {
        if (UI && typeof UI.showToast === 'function') return UI.showToast(title, msg, type);
        if (typeof window.showToast === 'function') return window.showToast(title, msg, type);
        console[type === 'error' ? 'error' : 'log'](title + ': ' + (msg || ''));
    }

    function computeProfitForSale(sale) {
        let gross = 0;
        (sale.items || []).forEach(it => {
            gross += (it.price - (it.buyPrice || 0)) * it.qty;
        });
        return gross - (sale.discount || 0);
    }

    function prepareSalesFiltersIfEmpty() {
        const els = _getEls();
        const today = new Date();
        if (!els['sales-filter-from'] || !els['sales-filter-to']) return;
        if (!els['sales-filter-from'].value) {
            const weekAgo = new Date(today.getTime() - 6 * 86400000);
            els['sales-filter-from'].value = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(weekAgo) : toDateInput(weekAgo);
        }
        if (!els['sales-filter-to'].value) {
            els['sales-filter-to'].value = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(today) : toDateInput(today);
        }
        populateSalespersonFilter();
    }

    function populateSalespersonFilter() {
        const els = _getEls();
        const db = _getDb();
        const sel = els['sales-filter-user'];
        if (!sel) return;
        const prev = sel.value || 'all';
        sel.innerHTML = '';
        const optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = 'All';
        sel.appendChild(optAll);

        (db.users || []).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.role === (window.ROLE_SUPERADMIN || 'superadmin') ? 'Superadmin' : 'Sales'})`;
            sel.appendChild(opt);
        });
        sel.value = prev;
    }

    function clearSalesFilters() {
        const els = _getEls();
        if (!els['sales-filter-from']) return;
        els['sales-filter-from'].value = '';
        els['sales-filter-to'].value = '';
        if (els['sales-filter-status']) els['sales-filter-status'].value = 'all';
        if (els['sales-filter-user']) els['sales-filter-user'].value = 'all';
        if (els['sales-filter-query']) els['sales-filter-query'].value = '';
        if (typeof window.renderSalesTable === 'function') window.renderSalesTable();
    }

    function renderSalesTable() {
        const els = _getEls();
        const db = _getDb();
        const tbody = els['sales-table-body'];
        if (!tbody) return;
        tbody.innerHTML = '';

        const from = els['sales-filter-from'].value;
        const to = els['sales-filter-to'].value;
        const status = els['sales-filter-status'].value;
        const userId = els['sales-filter-user'].value;
        const query = (els['sales-filter-query'] && els['sales-filter-query'].value || '').trim().toLowerCase();

        (db.sales || [])
            .slice()
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
            .forEach(sale => {
                if (from || to) {
                    const d = new Date(sale.createdAt || sale.updatedAt || new Date());
                    const dStr = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(d) : toDateInput(d);
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
                const user = (db.users || []).find(u => u.id === sale.salespersonId);
                tdUser.textContent = user ? user.name : '—';
                tr.appendChild(tdUser);

                const tdStatus = document.createElement('td');
                tdStatus.textContent = sale.status;
                tr.appendChild(tdStatus);

                const itemsCount = (sale.items || []).reduce((s, it) => s + it.qty, 0);
                const tdItems = document.createElement('td');
                tdItems.textContent = String(itemsCount);
                tr.appendChild(tdItems);

                const tdTotal = document.createElement('td');
                tdTotal.textContent = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(sale.total || 0) : formatMoney(sale.total || 0);
                tr.appendChild(tdTotal);

                const tdProfit = document.createElement('td');
                tdProfit.textContent = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(computeProfitForSale(sale)) : formatMoney(computeProfitForSale(sale));
                tr.appendChild(tdProfit);

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'center';
                const btnModify = document.createElement('button');
                btnModify.type = 'button';
                btnModify.className = 'btn btn-primary';
                btnModify.style.padding = '4px 10px';
                btnModify.style.fontSize = '12px';
                btnModify.textContent = 'Modify';
                btnModify.title = 'Edit this sale';
                btnModify.addEventListener('click', () => {
                    if (typeof window.loadSaleForEditing === 'function') {
                        window.loadSaleForEditing(sale.id);
                    }
                });
                tdActions.appendChild(btnModify);
                tr.appendChild(tdActions);

                tbody.appendChild(tr);
            });
    }

    // Expose API
    window.LitePos.sales = {
        prepareSalesFiltersIfEmpty,
        populateSalespersonFilter,
        clearSalesFilters,
        renderSalesTable,
        computeProfitForSale
    };

})();
