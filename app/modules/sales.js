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
    // For static elements - uses cached lookup via ui.getElement()
    function _getEl(id) { 
        return (UI && typeof UI.getElement === 'function') ? UI.getElement(id) : document.getElementById(id); 
    }
    // For dynamic elements - always fresh lookup, no caching
    function _getById(id) {
        return document.getElementById(id);
    }
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
        // Get current date in local timezone
        const today = UTILS && typeof UTILS.now === 'function' ? UTILS.now() : new Date();
        if (!_getEl('sales-filter-from') || !_getEl('sales-filter-to')) return;

        if (!_getEl('sales-filter-from').value) {
            const weekAgo = new Date(today);
            weekAgo.setDate(today.getDate() - 7);
            const formatForInput = UTILS && typeof UTILS.toDateInputLocal === 'function' 
                ? UTILS.toDateInputLocal 
                : (d => d.toISOString().split('T')[0]);
            _getEl('sales-filter-from').value = formatForInput(weekAgo);
        }
        if (!_getEl('sales-filter-to').value) {
            const formatForInput = UTILS && typeof UTILS.toDateInputLocal === 'function' 
                ? UTILS.toDateInputLocal 
                : (d => d.toISOString().split('T')[0]);
            _getEl('sales-filter-to').value = formatForInput(today);
        }
    }

    function applyDateRange(range) {
        // Get current date in local timezone
        const today = UTILS && typeof UTILS.now === 'function' ? UTILS.now() : new Date();
        let fromDate, toDate;

        switch (range) {
            case 'today':
                fromDate = toDate = new Date(today);
                break;
            case 'last7days':
                fromDate = new Date(today);
                fromDate.setDate(today.getDate() - 6);
                toDate = new Date(today);
                break;
            case 'last30days':
                fromDate = new Date(today);
                fromDate.setDate(today.getDate() - 29);
                toDate = new Date(today);
                break;
            case 'thismonth':
                fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
                toDate = new Date(today);
                break;
            case 'last3months':
                fromDate = new Date(today);
                fromDate.setMonth(today.getMonth() - 3);
                toDate = new Date(today);
                break;
            case 'last6months':
                fromDate = new Date(today);
                fromDate.setMonth(today.getMonth() - 6);
                toDate = new Date(today);
                break;
            case 'thisyear':
                fromDate = new Date(today.getFullYear(), 0, 1);
                toDate = new Date(today);
                break;
            case 'alltime':
                // Get all sales from the database
                const db = _getDb();
                const allSales = (db.sales || []);
                if (allSales.length > 0) {
                    // Find earliest and latest sale dates
                    const dates = allSales.map(s => new Date(s.createdAt));
                    const earliest = new Date(Math.min(...dates));
                    const latest = new Date(Math.max(...dates));
                    fromDate = earliest;
                    toDate = latest;
                } else {
                    // No sales, default to today
                    fromDate = toDate = new Date(today);
                }
                break;
            case 'custom':
            default:
                return; // Don't change the dates for custom
        }

        if (fromDate && toDate) {
            // Use timezone-aware date formatting
            const formatForInput = UTILS && typeof UTILS.toDateInputLocal === 'function' 
                ? UTILS.toDateInputLocal 
                : (d => d.toISOString().split('T')[0]);
            
            _getEl('sales-filter-from').value = formatForInput(fromDate);
            _getEl('sales-filter-to').value = formatForInput(toDate);
            renderSalesTable();
        }
    }

    function populateSalespersonFilter() {
        const els = _getEls();
        const db = _getDb();
        const sel = _getEl('sales-filter-user');
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
        if (!_getEl('sales-filter-from')) return;
        _getEl('sales-filter-from').value = '';
        _getEl('sales-filter-to').value = '';
        if (_getEl('sales-filter-status')) _getEl('sales-filter-status').value = 'all';
        if (_getEl('sales-filter-user')) _getEl('sales-filter-user').value = 'all';
        if (_getEl('sales-filter-query')) _getEl('sales-filter-query').value = '';
        if (_getEl('sales-filter-date-range')) _getEl('sales-filter-date-range').value = 'custom';
        if (typeof window.renderSalesTable === 'function') window.renderSalesTable();
    }

    function printReceiptForSale(saleId) {
        const db = _getDb();
        const sale = (db.sales || []).find(s => s.id === saleId);
        if (!sale) {
            _showToast('Print', 'Sale not found.', 'error');
            return;
        }

        // Use pos module's fillReceiptFromSale if available
        if (window.LitePos?.pos?.fillReceiptFromSale) {
            window.LitePos.pos.fillReceiptFromSale(sale);
        }

        // Get global settings for template and size
        const settings = db.settings || {};
        const template = settings.defaultPrintTemplate || 'standard';
        const size = settings.defaultPrintSize || 'a4';

        // Show/hide templates
        const standardTemplate = document.getElementById('receipt-standard');
        const compactTemplate = document.getElementById('receipt-compact');
        if (standardTemplate) standardTemplate.style.display = (template === 'standard') ? 'block' : 'none';
        if (compactTemplate) compactTemplate.style.display = (template === 'compact') ? 'block' : 'none';

        // Add print classes
        document.body.classList.add('print-receipt');
        document.body.classList.add(
            size === '80mm' ? 'receipt-80mm' :
            size === '58mm' ? 'receipt-58mm' : 'receipt-a4'
        );

        // Print
        setTimeout(() => {
            window.print();
        }, 200);

        // Cleanup after print
        setTimeout(() => {
            document.body.classList.remove('print-receipt', 'receipt-a4', 'receipt-80mm', 'receipt-58mm');
        }, 1000);
    }

    function deleteSaleWithConfirmation(saleId) {
        const db = _getDb();
        const sale = db.sales.find(s => s.id === saleId);
        if (!sale) {
            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Error', 'Sale not found.', 'error');
            }
            return;
        }

        const currentUser = (window.LitePos && window.LitePos.state && window.LitePos.state.currentUser) || null;
        if (!currentUser || currentUser.role !== 'superadmin') {
            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Permission denied', 'Only superadmin can delete sales.', 'error');
            }
            return;
        }

        // First confirmation
        const confirmMsg = `Delete sale ${saleId}?\n\nCustomer: ${sale.customer?.name || 'Walk-in'}\nTotal: ৳${sale.total || 0}\nStatus: ${sale.status}\n\nThis action cannot be undone.`;
        if (!confirm(confirmMsg)) return;

        // Ask for PIN
        const pin = prompt('Enter your superadmin PIN to confirm deletion:');
        if (!pin) return;

        if (pin !== currentUser.pin) {
            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Invalid PIN', 'Incorrect PIN. Sale not deleted.', 'error');
            }
            return;
        }

        // Delete the sale
        const idx = db.sales.findIndex(s => s.id === saleId);
        if (idx !== -1) {
            db.sales.splice(idx, 1);
            
            // Save database
            if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveDb === 'function') {
                window.LitePos.api.saveDb();
            } else {
                localStorage.setItem('litepos_bdt_db_v1', JSON.stringify(db));
            }

            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Sale deleted', `Sale ${saleId} has been permanently deleted.`, 'success');
            }

            // Refresh the table and other views
            renderSalesTable();
            if (window.LitePos && window.LitePos.pos) {
                if (window.LitePos.pos.renderOpenSalesStrip) window.LitePos.pos.renderOpenSalesStrip();
                if (window.LitePos.pos.refreshKpis) window.LitePos.pos.refreshKpis();
            }
        }
    }

    function renderSalesTable() {
        const els = _getEls();
        const db = _getDb();
        const tbody = _getEl('sales-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const from = _getEl('sales-filter-from').value;
        const to = _getEl('sales-filter-to').value;
        const status = _getEl('sales-filter-status').value;
        const userId = _getEl('sales-filter-user').value;
        const query = (_getEl('sales-filter-query') && _getEl('sales-filter-query').value || '').trim().toLowerCase();

        // Filter and sort sales
        const filteredSales = (db.sales || [])
            .slice()
            .filter(sale => {
                if (from || to) {
                    // Sale dates are stored in UTC, convert to local timezone for comparison
                    const saleDate = new Date(sale.createdAt || sale.updatedAt || new Date());
                    const localDate = UTILS && typeof UTILS.utcToLocal === 'function' 
                        ? UTILS.utcToLocal(saleDate) 
                        : saleDate;
                    
                    const formatForCompare = UTILS && typeof UTILS.toDateInputLocal === 'function'
                        ? UTILS.toDateInputLocal
                        : (d => d.toISOString().split('T')[0]);
                    
                    const dStr = formatForCompare(localDate);
                    if (from && dStr < from) return false;
                    if (to && dStr > to) return false;
                }

                if (status !== 'all' && sale.status !== status) return false;
                if (userId && userId !== 'all' && sale.salespersonId !== userId) return false;

                if (query) {
                    const customerName = sale.customer && sale.customer.name ? sale.customer.name : '';
                    const phone = sale.customer && sale.customer.phone ? sale.customer.phone : '';
                    const text = (sale.id + ' ' + customerName + ' ' + phone).toLowerCase();
                    if (!text.includes(query)) return false;
                }

                return true;
            })
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        if (filteredSales.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;">No Sales Found</td></tr>';
            return;
        }

        // Group sales by date
        const groupsByDate = {};
        filteredSales.forEach(sale => {
            const saleDate = new Date(sale.createdAt || sale.updatedAt || new Date());
            // Convert UTC to local timezone for grouping
            const localDate = UTILS && typeof UTILS.utcToLocal === 'function' 
                ? UTILS.utcToLocal(saleDate) 
                : saleDate;
            const dateKey = localDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
            
            if (!groupsByDate[dateKey]) {
                groupsByDate[dateKey] = {
                    sales: [],
                    count: 0,
                    total: 0,
                    profit: 0
                };
            }
            
            const group = groupsByDate[dateKey];
            group.sales.push(sale);
            group.count++;
            group.total += (sale.total || 0);
            group.profit += computeProfitForSale(sale);
        });

        // Sort date keys descending (newest first)
        const sortedDates = Object.keys(groupsByDate).sort((a, b) => b.localeCompare(a));

        // Calculate global totals
        let globalCount = 0;
        let globalTotal = 0;
        let globalProfit = 0;
        sortedDates.forEach(dateKey => {
            const group = groupsByDate[dateKey];
            globalCount += group.count;
            globalTotal += group.total;
            globalProfit += group.profit;
        });

        // Render global summary above table
        const summaryContainer = _getEl('sales-global-summary-container');
        if (summaryContainer) {
            const globalSummaryDiv = document.createElement('div');
            globalSummaryDiv.className = 'sales-global-summary';
            globalSummaryDiv.innerHTML = `
                <div class="summary-title">📊 Summary</div>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <div class="stat-value">${globalCount}</div>
                        <div class="stat-label">Total Sales</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-value">${(UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(globalTotal) : formatMoney(globalTotal)}</div>
                        <div class="stat-label">Total Revenue</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-value">${(UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(globalProfit) : formatMoney(globalProfit)}</div>
                        <div class="stat-label">Total Profit</div>
                    </div>
                    <div class="summary-stat">
                        <div class="stat-value">${globalTotal > 0 ? (UTILS && typeof UTILS.formatMoney === 'function' ? UTILS.formatMoney(globalTotal / globalCount) : formatMoney(globalTotal / globalCount)) : '0.00'}</div>
                        <div class="stat-label">Avg Sale</div>
                    </div>
                </div>
            `;
            summaryContainer.innerHTML = '';
            summaryContainer.appendChild(globalSummaryDiv);
        }

        // Render grouped sales with date headers as special rows
        sortedDates.forEach(dateKey => {
            const group = groupsByDate[dateKey];
            const dateDisplay = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });

            // Create date header row
            const headerRow = document.createElement('tr');
            headerRow.className = 'sales-date-header-row';
            const headerCell = document.createElement('td');
            headerCell.colSpan = 10;
            headerCell.innerHTML = `
                <div class="sales-date-header">
                    <div class="date-title">
                        <span>📅</span>
                        <span>${dateDisplay}</span>
                    </div>
                    <div class="date-stats">
                        <div class="stat-item stat-count">
                            <span class="stat-value">${group.count}</span>
                            <span class="stat-label">sale${group.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="stat-item stat-total">
                            <span class="stat-value">${(UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(group.total) : formatMoney(group.total)}</span>
                            <span class="stat-label">revenue</span>
                        </div>
                        <div class="stat-item stat-profit">
                            <span class="stat-value">${(UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(group.profit) : formatMoney(group.profit)}</span>
                            <span class="stat-label">profit</span>
                        </div>
                    </div>
                </div>
            `;
            headerRow.appendChild(headerCell);
            tbody.appendChild(headerRow);

            // Individual sale rows for this date
            group.sales.forEach(sale => {
                const tr = document.createElement('tr');
                tr.classList.add('sales-data-row');
                if (sale.status === 'closed') {
                    tr.classList.add('sale-closed');
                }
                if (sale.status === 'open') {
                    tr.classList.add('sale-open');
                }

                const tdId = document.createElement('td');
                tdId.textContent = sale.id || '—';
                tdId.style.fontSize = '13px';
                tdId.style.fontWeight = '600';
                tr.appendChild(tdId);

                const tdDate = document.createElement('td');
                const saleDate = new Date(sale.createdAt || sale.updatedAt || new Date());
                // Format time in configured timezone
                if (UTILS && typeof UTILS.formatTimeInTimezone === 'function') {
                    tdDate.textContent = UTILS.formatTimeInTimezone(saleDate, { hour12: true });
                } else {
                    // Fallback to regular time display
                    tdDate.textContent = saleDate.toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit', 
                        hour12: true 
                    });
                }
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
                tdActions.style.width = '150px';
                tdActions.style.textAlign = 'right';
                tdActions.style.display = 'flex';
                tdActions.style.gap = '6px';
                tdActions.style.justifyContent = 'flex-end';
                
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
                
                // Add Print Receipt button for closed sales
                if (sale.status === 'closed') {
                    const btnPrint = document.createElement('button');
                    btnPrint.type = 'button';
                    btnPrint.className = 'btn btn-ghost';
                    btnPrint.style.padding = '4px 10px';
                    btnPrint.style.fontSize = '12px';
                    btnPrint.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">  <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" /></svg>';
                    btnPrint.title = 'Print receipt';
                    btnPrint.addEventListener('click', () => {
                        printReceiptForSale(sale.id);
                    });
                    tdActions.appendChild(btnPrint);
                }
                
                // Add delete button for superadmin only
                const currentUser = (window.LitePos && window.LitePos.state && window.LitePos.state.currentUser) || null;
                if (currentUser && currentUser.role === 'superadmin') {
                    const btnDelete = document.createElement('button');
                    btnDelete.type = 'button';
                    btnDelete.className = 'btn btn-ghost';
                    btnDelete.style.padding = '4px 8px';
                    btnDelete.style.fontSize = '15px';
                    btnDelete.style.color = '#ef4444';
                    btnDelete.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
                    btnDelete.title = 'Delete this sale (Superadmin only)';
                    btnDelete.addEventListener('click', () => {
                        deleteSaleWithConfirmation(sale.id);
                    });
                    tdActions.appendChild(btnDelete);
                }
                
                tr.appendChild(tdActions);
                tbody.appendChild(tr);
            });
        });
    }    // Expose API
    window.LitePos.sales = {
        prepareSalesFiltersIfEmpty,
        populateSalespersonFilter,
        clearSalesFilters,
        renderSalesTable,
        computeProfitForSale,
        printReceiptForSale,
        applyDateRange
    };

    // Initialize date range filter when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDateRangeFilter);
    } else {
        initDateRangeFilter();
    }

    function initDateRangeFilter() {
        const dateRangeSelect = _getEl('sales-filter-date-range');
        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', (e) => {
                applyDateRange(e.target.value);
            });
        }
    }

})();
