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

        // Set default date range to last 7 days if not already set
        if (_getEl('sales-filter-date-range') && !_getEl('sales-filter-date-range').value) {
            _getEl('sales-filter-date-range').value = 'last7days';
        }

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
        if (_getEl('sales-filter-payment-method')) _getEl('sales-filter-payment-method').value = 'all';
        if (_getEl('sales-filter-query')) _getEl('sales-filter-query').value = '';
        if (_getEl('sales-filter-date-range')) {
            _getEl('sales-filter-date-range').value = 'last7days';
            applyDateRange('last7days');
        } else {
            if (typeof window.renderSalesTable === 'function') window.renderSalesTable();
        }
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

        // Get modalNotifier from UI
        const modalNotifier = UI.modalNotifier || window.LitePos?.ui?.modalNotifier;
        if (!modalNotifier) {
            console.error('modalNotifier not available, falling back to confirm');
            const confirmMsg = `Delete sale ${saleId}?\n\nCustomer: ${sale.customer?.name || 'Walk-in'}\nTotal: ৳${sale.total || 0}\nStatus: ${sale.status}\n\nThis action cannot be undone.`;
            if (!confirm(confirmMsg)) return;
            performDeletion(saleId, false);
            return;
        }

        // Build sale info for display
        const itemsText = sale.items && sale.items.length > 0 
            ? `${sale.items.length} item(s)` 
            : 'No items';
        
        // First modal: Ask about stock restoration
        modalNotifier.show({
            type: 'warning',
            title: 'Delete Sale',
            message: `Are you sure you want to delete this sale?\n\nSale ID: ${saleId}\nCustomer: ${sale.customer?.name || 'Walk-in'}\nItems: ${itemsText}\nTotal: ৳${sale.total || 0}\nStatus: ${sale.status}\n\nThis action cannot be undone.`,
            actions: [
                {
                    label: 'Delete & restore stock',
                    variant: 'danger',
                    title: 'Delete sale and add items back to inventory',
                    onClick: () => {
                        // Ask for PIN before deleting with stock restoration
                        showPinConfirmation(saleId, true);
                    }
                },
                {
                    label: 'Delete without restoring stock',
                    variant: 'danger',
                    title: 'Delete sale but keep inventory as-is',
                    onClick: () => {
                        // Ask for PIN before deleting without stock restoration
                        showPinConfirmation(saleId, false);
                    }
                },
                {
                    label: 'Cancel',
                    variant: 'ghost',
                    autofocus: true
                }
            ]
        });
    }

    function showPinConfirmation(saleId, restoreStock) {
        const currentUser = (window.LitePos && window.LitePos.state && window.LitePos.state.currentUser) || null;
        const modalNotifier = UI.modalNotifier || window.LitePos?.ui?.modalNotifier;
        
        if (!modalNotifier) {
            const pin = prompt('Enter your superadmin PIN to confirm deletion:');
            if (pin && pin === currentUser.pin) {
                performDeletion(saleId, restoreStock);
            } else if (pin) {
                if (UTILS && typeof UTILS.showToast === 'function') {
                    UTILS.showToast('Invalid PIN', 'Incorrect PIN. Sale not deleted.', 'error');
                }
            }
            return;
        }

        modalNotifier.show({
            type: 'warning',
            title: 'Confirm Deletion',
            messageHtml: `
                <p style="margin: 0 0 16px 0;">Enter your superadmin PIN to confirm deletion of this sale.</p>
                <label style="display: block; margin-bottom: 8px; font-size: 13px; color: var(--text-muted); font-weight: 500;">
                    Superadmin PIN:
                </label>
                <input 
                    type="password" 
                    id="delete-sale-pin-input" 
                    class="field-input" 
                    maxlength="6" 
                    placeholder="Enter PIN" 
                    autocomplete="off"
                    inputmode="numeric"
                    style="width: 100%; padding: 10px; font-size: 16px; border: 1px solid var(--border); border-radius: 8px; font-family: monospace; letter-spacing: 0.5em;"
                />
            `,
            actions: [
                {
                    label: 'Confirm deletion',
                    variant: 'danger',
                    autofocus: false,
                    onClick: () => {
                        const pinInput = document.getElementById('delete-sale-pin-input');
                        const pin = pinInput ? pinInput.value.trim() : '';
                        
                        if (!pin) {
                            if (UTILS && typeof UTILS.showToast === 'function') {
                                UTILS.showToast('PIN required', 'Please enter your PIN.', 'error');
                            }
                            return;
                        }
                        
                        if (pin !== currentUser.pin) {
                            if (UTILS && typeof UTILS.showToast === 'function') {
                                UTILS.showToast('Invalid PIN', 'Incorrect PIN. Sale not deleted.', 'error');
                            }
                            return;
                        }
                        
                        performDeletion(saleId, restoreStock);
                    }
                },
                {
                    label: 'Cancel',
                    variant: 'ghost',
                    autofocus: true
                }
            ]
        });

        // Focus PIN input and add Enter key support after modal renders
        setTimeout(() => {
            const pinInput = document.getElementById('delete-sale-pin-input');
            if (pinInput) {
                pinInput.focus();
                pinInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const pin = pinInput.value.trim();
                        
                        if (!pin) {
                            if (UTILS && typeof UTILS.showToast === 'function') {
                                UTILS.showToast('PIN required', 'Please enter your PIN.', 'error');
                            }
                            return;
                        }
                        
                        if (pin !== currentUser.pin) {
                            if (UTILS && typeof UTILS.showToast === 'function') {
                                UTILS.showToast('Invalid PIN', 'Incorrect PIN. Sale not deleted.', 'error');
                            }
                            return;
                        }
                        
                        // Close modal and perform deletion
                        if (modalNotifier.close) modalNotifier.close();
                        performDeletion(saleId, restoreStock);
                    }
                });
            }
        }, 100);
    }

    function performDeletion(saleId, restoreStock) {
        const db = _getDb();
        const sale = db.sales.find(s => s.id === saleId);
        
        if (!sale) {
            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Error', 'Sale not found.', 'error');
            }
            return;
        }

        // Restore stock if requested
        if (restoreStock && sale.items && sale.items.length > 0) {
            sale.items.forEach(item => {
                // Find product by ID first, fallback to SKU
                let product = db.products.find(p => p.id === item.productId);
                if (!product && item.sku) {
                    product = db.products.find(p => p.sku === item.sku);
                }
                
                if (product) {
                    product.stock = (product.stock || 0) + item.qty;
                    console.log(`Restored ${item.qty} units of ${product.name} (${product.id}). New stock: ${product.stock}`);
                }
            });
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

            const stockMsg = restoreStock ? ' Stock has been restored to inventory.' : '';
            if (UTILS && typeof UTILS.showToast === 'function') {
                UTILS.showToast('Sale deleted', `Sale ${saleId} has been permanently deleted.${stockMsg}`, 'success');
            }

            // Refresh the table and other views
            renderSalesTable();
            if (window.LitePos && window.LitePos.pos) {
                if (window.LitePos.pos.renderOpenSalesStrip) window.LitePos.pos.renderOpenSalesStrip();
                if (window.LitePos.pos.refreshKpis) window.LitePos.pos.refreshKpis();
                if (window.LitePos.pos.renderProductsTable) window.LitePos.pos.renderProductsTable();
            }
        }
    }

    function viewSaleDetails(sale) {
        const modalWindow = UI.modalWindow || window.LitePos?.ui?.modalWindow;
        if (!modalWindow) {
            _showToast('Error', 'Modal system not available.', 'error');
            return;
        }
        
        const db = _getDb();
        const formatMoney = (v) => {
            if (UTILS && typeof UTILS.formatMoney === 'function') return UTILS.formatMoney(v);
            const n = Number(v || 0);
            return '৳ ' + n.toFixed(2);
        };
        
        const saleDate = new Date(sale.createdAt || sale.updatedAt || new Date());
        const dateStr = saleDate.toLocaleString('en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        
        const salesperson = (db.users || []).find(u => u.id === sale.salespersonId);
        const customerName = sale.customer?.name || 'Walk-in';
        const customerPhone = sale.customer?.phone || '—';
        const paymentMethod = sale.payment_method || 'cash';
        const paymentDetails = sale.payment_details || '';
        
        let itemsHtml = '';
        (sale.items || []).forEach(item => {
            const itemTotal = (item.price || 0) * (item.qty || 0);
            const barcode = item.barcode || '—';
            const sku = item.sku || '—';
            itemsHtml += `
                <tr style="border-bottom: 1px solid var(--border-light);">
                    <td style="padding: 10px 12px;">${item.name || '—'}</td>
                    <td style="padding: 10px 12px; font-size: 11px; color: var(--text-soft);">${sku}</td>
                    <td style="padding: 10px 12px; font-size: 11px; color: var(--text-soft);">${barcode}</td>
                    <td style="padding: 10px 12px; text-align: center; font-family: monospace;">${item.qty}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: monospace;">${formatMoney(item.price)}</td>
                    <td style="padding: 10px 12px; text-align: right; font-family: monospace; font-weight: 600;">${formatMoney(itemTotal)}</td>
                </tr>`;
        });
        
        const subtotal = (sale.items || []).reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 0)), 0);
        const discount = sale.discount || 0;
        const total = sale.total || 0;
        const payment = sale.payment || 0;
        const change = sale.change || 0;
        const due = sale.debt || 0;
        const profit = computeProfitForSale(sale);
        
        const detailsHtml = `
            <div style="">
                <div style="background: var(--bg-soft); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 13px;">
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Sale ID</div><div style="font-weight: 600; font-size: 15px;">${sale.id || '—'}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Status</div><div style="font-weight: 600; text-transform: capitalize;">${sale.status || '—'}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Date & Time</div><div style="font-weight: 500;">${dateStr}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Salesperson</div><div style="font-weight: 500;">${salesperson?.name || '—'}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Customer</div><div style="font-weight: 500;">${customerName}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Phone</div><div style="font-weight: 500;">${customerPhone}</div></div>
                        <div><div style="color: var(--text-soft); margin-bottom: 4px;">Payment Method</div><div style="font-weight: 500; text-transform: capitalize;">${paymentMethod}</div></div>
                        ${paymentDetails ? `<div><div style="color: var(--text-soft); margin-bottom: 4px;">Payment Details</div><div style="font-weight: 500;">${paymentDetails}</div></div>` : ''}
                    </div>
                </div>
                <div style="margin-bottom: 16px;">
                    <h4 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">Items</h4>
                    <div style="border: 1px solid var(--border); border-radius: 8px; overflow: hidden;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead style="background: var(--bg-soft); border-bottom: 1px solid var(--border);">
                                <tr>
                                    <th style="padding: 10px 12px; text-align: left; font-weight: 600;">Product</th>
                                    <th style="padding: 10px 12px; text-align: left; font-weight: 600;">SKU</th>
                                    <th style="padding: 10px 12px; text-align: left; font-weight: 600;">Barcode</th>
                                    <th style="padding: 10px 12px; text-align: center; font-weight: 600;">Qty</th>
                                    <th style="padding: 10px 12px; text-align: right; font-weight: 600;">Price</th>
                                    <th style="padding: 10px 12px; text-align: right; font-weight: 600;">Total</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div style="background: var(--bg-soft); border-radius: 8px; padding: 16px;">
                    <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
                        <div style="display: flex; justify-content: space-between;"><span>Subtotal:</span><span style="font-family: monospace;">${formatMoney(subtotal)}</span></div>
                        <div style="display: flex; justify-content: space-between;"><span>Discount:</span><span style="font-family: monospace; color: var(--danger);">-${formatMoney(discount)}</span></div>
                        <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid var(--border); font-weight: 600; font-size: 16px;"><span>Total:</span><span style="font-family: monospace;">${formatMoney(total)}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-top: 8px;"><span>Payment:</span><span style="font-family: monospace;">${formatMoney(payment)}</span></div>
                        ${change > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Change:</span><span style="font-family: monospace;">${formatMoney(change)}</span></div>` : ''}
                        ${due > 0 ? `<div style="display: flex; justify-content: space-between; color: var(--danger); font-weight: 600;"><span>Due:</span><span style="font-family: monospace;">${formatMoney(due)}</span></div>` : ''}
                        <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);"><span>Profit:</span><span style="font-family: monospace; color: ${profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 600;">${formatMoney(profit)}</span></div>
                    </div>
                </div>
            </div>
        `;
        
        modalWindow.show({
            title: `Sale Details - ${sale.id}`,
            bodyHtml: detailsHtml,
            actions: [{ label: 'Close', variant: 'ghost', autofocus: true }]
        });
    }

    function renderSalesTable() {
        const els = _getEls();
        const db = _getDb();
        const tbody = _getEl('sales-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const from = _getEl('sales-filter-from') ? _getEl('sales-filter-from').value : '';
        const to = _getEl('sales-filter-to') ? _getEl('sales-filter-to').value : '';
        const status = _getEl('sales-filter-status') ? _getEl('sales-filter-status').value : 'all';
        const userId = _getEl('sales-filter-user') ? _getEl('sales-filter-user').value : 'all';
        const paymentMethod = _getEl('sales-filter-payment-method') ? _getEl('sales-filter-payment-method').value : 'all';
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

                if (status === 'withdue') {
                    // Filter sales with due amount (debt > 0)
                    if (!sale.debt || sale.debt <= 0) return false;
                } else if (status !== 'all' && sale.status !== status) {
                    return false;
                }
                
                if (userId && userId !== 'all' && sale.salespersonId !== userId) return false;
                
                // Filter by payment method
                if (paymentMethod && paymentMethod !== 'all') {
                    const salePaymentMethod = sale.payment_method || 'cash';
                    if (salePaymentMethod !== paymentMethod) return false;
                }

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
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No Sales Found</td></tr>';
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
        let globalDue = 0;
        sortedDates.forEach(dateKey => {
            const group = groupsByDate[dateKey];
            globalCount += group.count;
            globalTotal += group.total;
            globalProfit += group.profit;
        });
        
        // Calculate total due from all filtered sales
        filteredSales.forEach(sale => {
            globalDue += (sale.debt || 0);
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
                        <div class="stat-value" style="color: ${globalDue > 0 ? 'var(--danger)' : 'inherit'};">${(UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(globalDue) : formatMoney(globalDue)}</div>
                        <div class="stat-label">Total Due</div>
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
            headerCell.colSpan = 11;
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

                const tdPayment = document.createElement('td');
                const paymentMethod = sale.payment_method || 'cash';
                const paymentDetails = sale.payment_details || '';
                tdPayment.innerHTML = `
                    <div style="font-size: 13px; line-height: 1.4;">
                        <div style="font-weight: 500; text-transform: capitalize;">${paymentMethod}</div>
                        ${paymentDetails ? `<div style="font-size: 11px; color: var(--text-soft);">${paymentDetails}</div>` : ''}
                    </div>
                `;
                tr.appendChild(tdPayment);

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
                const profit = computeProfitForSale(sale);
                const due = sale.debt || 0;
                
                if (due > 0) {
                    // Show profit on first line, due on second line in red
                    const profitText = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(profit) : formatMoney(profit);
                    const dueText = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(due) : formatMoney(due);
                    tdProfit.innerHTML = `${profitText}<br><span style="color: var(--danger); font-size: 12px;">Due: ${dueText}</span>`;
                } else {
                    tdProfit.textContent = (UTILS && typeof UTILS.formatMoney === 'function') ? UTILS.formatMoney(profit) : formatMoney(profit);
                }
                tr.appendChild(tdProfit);

                const tdActions = document.createElement('td');
                // tdActions.style.width = '200px';
                const actionsContainer = document.createElement('div');
                actionsContainer.style.height = '100%';
                actionsContainer.style.textAlign = 'right';
                actionsContainer.style.display = 'flex';
                actionsContainer.style.gap = '6px';
                actionsContainer.style.justifyContent = 'flex-end';
                tdActions.appendChild(actionsContainer);   
                
                // View details button (always shown)
                const btnView = document.createElement('button');
                btnView.type = 'button';
                btnView.className = 'btn btn-ghost';
                btnView.style.padding = '4px 8px';
                btnView.style.fontSize = '12px';
                btnView.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>';
                btnView.title = 'View details';
                btnView.addEventListener('click', () => {
                    viewSaleDetails(sale);
                });
                actionsContainer.appendChild(btnView);
                
                // Modify button (always shown)
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
                actionsContainer.appendChild(btnModify);
                
                // Print Receipt button (always shown, disabled for open sales)
                const btnPrint = document.createElement('button');
                btnPrint.type = 'button';
                btnPrint.className = 'btn btn-ghost';
                btnPrint.style.padding = '4px 10px';
                btnPrint.style.fontSize = '12px';
                btnPrint.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon">  <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" /></svg>';
                if (sale.status === 'closed') {
                    btnPrint.title = 'Print receipt';
                    btnPrint.addEventListener('click', () => {
                        printReceiptForSale(sale.id);
                    });
                } else {
                    btnPrint.disabled = true;
                    btnPrint.title = 'Print receipt (Only for closed sales)';
                    btnPrint.style.opacity = '0.4';
                    btnPrint.style.cursor = 'not-allowed';
                }
                actionsContainer.appendChild(btnPrint);
                
                // Delete button (always shown, only enabled for superadmin)
                const currentUser = (window.LitePos && window.LitePos.state && window.LitePos.state.currentUser) || null;
                const btnDelete = document.createElement('button');
                btnDelete.type = 'button';
                btnDelete.className = 'btn btn-ghost';
                btnDelete.style.padding = '4px 8px';
                btnDelete.style.fontSize = '15px';
                btnDelete.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
                if (currentUser && currentUser.role === 'superadmin') {
                    btnDelete.style.color = '#ef4444';
                    btnDelete.title = 'Delete this sale';
                    btnDelete.addEventListener('click', () => {
                        deleteSaleWithConfirmation(sale.id);
                    });
                } else {
                    btnDelete.disabled = true;
                    btnDelete.title = 'Delete sale (Superadmin only)';
                    btnDelete.style.opacity = '0.3';
                    btnDelete.style.cursor = 'not-allowed';
                }
                actionsContainer.appendChild(btnDelete);
                
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
