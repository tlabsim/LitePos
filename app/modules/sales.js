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
        const today = new Date();
        if (!_getEl('sales-filter-from') || !_getEl('sales-filter-to')) return;
        if (!_getEl('sales-filter-from').value) {
            const weekAgo = new Date(today.getTime() - 6 * 86400000);
            _getEl('sales-filter-from').value = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(weekAgo) : toDateInput(weekAgo);
        }
        if (!_getEl('sales-filter-to').value) {
            _getEl('sales-filter-to').value = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(today) : toDateInput(today);
        }
        populateSalespersonFilter();
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
        if (typeof window.renderSalesTable === 'function') window.renderSalesTable();
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
                    const d = new Date(sale.createdAt || sale.updatedAt || new Date());
                    const dStr = (UTILS && typeof UTILS.toDateInput === 'function') ? UTILS.toDateInput(d) : toDateInput(d);
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
            const d = new Date(sale.createdAt || sale.updatedAt || new Date());
            const dateKey = d.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            
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

        // Render grouped table with containers
        sortedDates.forEach(dateKey => {
      const group = groupsByDate[dateKey];
      const dateDisplay = new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });

      // Create date group container
      const groupContainer = document.createElement('div');
      groupContainer.className = 'sales-date-group';

      // Date header with stats
      const headerDiv = document.createElement('div');
      headerDiv.className = 'sales-date-header';
      headerDiv.innerHTML = `
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
      `;
      groupContainer.appendChild(headerDiv);

      // Create mini table for this date's sales
      const miniTable = document.createElement('table');
      miniTable.innerHTML = '<tbody></tbody>';
      const miniTbody = miniTable.querySelector('tbody');            // Individual sale rows for this date
            group.sales.forEach(sale => {
                const tr = document.createElement('tr');

                const tdId = document.createElement('td');
                tdId.textContent = sale.id || '—';
                tdId.style.width = '80px';
                tdId.style.fontSize = '13px';
                tdId.style.fontWeight = '600';
                tr.appendChild(tdId);

                const tdDate = document.createElement('td');
                tdDate.style.width = '8%';
                const d = new Date(sale.createdAt || sale.updatedAt || new Date());
                // Show time in AM/PM format
                tdDate.textContent = d.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                });
                tr.appendChild(tdDate);

                const tdCustomer = document.createElement('td');
                tdCustomer.style.width = '12%';
                const customerName = sale.customer && sale.customer.name ? sale.customer.name : 'Walk-in';
                tdCustomer.textContent = customerName;
                tr.appendChild(tdCustomer);

                const tdPhone = document.createElement('td');
                tdPhone.style.width = '8%';
                tdPhone.textContent = sale.customer && sale.customer.phone ? sale.customer.phone : '—';
                tr.appendChild(tdPhone);

                const tdUser = document.createElement('td');
                tdUser.style.width = '8%';  
                const user = (db.users || []).find(u => u.id === sale.salespersonId);
                tdUser.textContent = user ? user.name : '—';
                tr.appendChild(tdUser);

                const tdStatus = document.createElement('td');
                tdStatus.style.width = '8%';
                tdStatus.textContent = sale.status;
                tr.appendChild(tdStatus);

                const itemsCount = (sale.items || []).reduce((s, it) => s + it.qty, 0);
                
                const tdItems = document.createElement('td');
                tdItems.style.width = 'auto'; 
                tdItems.textContent = String(itemsCount);
                tr.appendChild(tdItems);

                const tdTotal = document.createElement('td');
                tdTotal.style.width = 'auto';
                tdTotal.textContent = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(sale.total || 0) : formatMoney(sale.total || 0);
                tr.appendChild(tdTotal);

                const tdProfit = document.createElement('td');
                tdProfit.style.width = 'auto';
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
                    btnPrint.className = 'btn btn-accent';
                    btnPrint.style.padding = '4px 10px';
                    btnPrint.style.fontSize = '12px';
                    btnPrint.innerHTML = '🖨';
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

        miniTbody.appendChild(tr);
      });

      // Append mini table to group container
      groupContainer.appendChild(miniTable);

      // Wrap group container in a tr and td to fit in main table structure
      const containerRow = document.createElement('tr');
      const containerCell = document.createElement('td');
      containerCell.colSpan = 10;
      containerCell.style.padding = '0 0 20px 0';
      containerCell.style.border = 'none';
      containerCell.appendChild(groupContainer);
      containerRow.appendChild(containerCell);
      tbody.appendChild(containerRow);
    });
  }    // Expose API
    window.LitePos.sales = {
        prepareSalesFiltersIfEmpty,
        populateSalespersonFilter,
        clearSalesFilters,
        renderSalesTable,
        computeProfitForSale
    };

})();
