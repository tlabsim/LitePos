// app/modules/pos.js
(function () {
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    ns.pos = ns.pos || {};
    ns.state = ns.state || {};
    ns.elements = ns.elements || {};

    const ROLE_SUPERADMIN = 'superadmin';

    function getCachedElement(id) {
        ns.elements = ns.elements || {};
        if (!ns.elements[id]) {
            ns.elements[id] = document.getElementById(id) || undefined;
        }
        return ns.elements[id] || null;
    }
    
    // For static elements - uses cached lookup via ui.getElement()
    function _getEl(id) {
        const UI = ns.ui || {};
        return (UI && typeof UI.getElement === 'function') ? UI.getElement(id) : getCachedElement(id);
    }
    
    // For dynamic elements - always fresh lookup, no caching
    function _getById(id) {
        return document.getElementById(id);
    }

    function syncCartEmptyState(hasItems) {
        const itemCount = ns.state.currentSale && Array.isArray(ns.state.currentSale.items)
            ? ns.state.currentSale.items.reduce((sum, it) => sum + (it.qty || 0), 0)
            : 0;
        const meta = {
            count: itemCount,
            hasSaleId: !!(ns.state.currentSale && ns.state.currentSale.id)
        };
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.syncCartUiState === 'function') {
            window.LitePos.ui.syncCartUiState(hasItems, meta);
            return;
        }
        const wrapper = getCachedElement('cart-table-wrapper');
        const emptyState = getCachedElement('cart-empty-state');
        if (wrapper) wrapper.classList.toggle('hidden', !hasItems);
        if (emptyState) emptyState.classList.toggle('hidden', hasItems);
    }

    ns.pos.createEmptySale = function () {
        const state = ns.state;
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
            salespersonId: (state.currentUser && state.currentUser.id) || null,
            lastModifiedBy: (state.currentUser && state.currentUser.id) || null
        };
    };

    // Initialize default receipt size from settings
    ns.pos.initReceiptSize = function () {
        const settings = ns.state.db?.settings || {};
        const defaultPrintSize = settings.defaultPrintSize || 'a4';
        const receiptSizeEl = _getEl('receipt-size');
        if (receiptSizeEl) {
            receiptSizeEl.value = defaultPrintSize;
        };
    };

    // Initialize default receipt size from settings
    ns.pos.initReceiptSize = function () {
        const settings = ns.state.db?.settings || {};
        const defaultPrintSize = settings.defaultPrintSize || 'a4';
        const receiptSizeEl = _getEl('receipt-size');
        if (receiptSizeEl) {
            receiptSizeEl.value = defaultPrintSize;
        }
    };

    ns.pos.startNewSale = function (notify) {
        // Check for auto-saved sale first
        if (!notify && ns.pos.recoverAutoSavedSale && ns.pos.recoverAutoSavedSale()) {
            return; // Sale recovered, don't create new one
        }
        
        ns.state.currentSale = ns.pos.createEmptySale();
        ns.state.currentSale.customer = null;
        const els = ns.elements || {};
        if (_getEl('input-discount')) _getEl('input-discount').value = '0';
        if (_getEl('input-payment')) _getEl('input-payment').value = '0';
        if (_getEl('cart-table-body')) _getEl('cart-table-body').innerHTML = '';
        
        // Properly sync cart UI state
        syncCartEmptyState(false);
        
        // Load default print size from global settings
        const settings = ns.state.db?.settings || {};
        const defaultPrintSize = settings.defaultPrintSize || 'a4';
        if (_getEl('receipt-size')) _getEl('receipt-size').value = defaultPrintSize;
        
        if (_getEl('summary-sale-status')) _getEl('summary-sale-status').textContent = 'New Sale';
        if (_getEl('summary-sale-id-value')) _getEl('summary-sale-id-value').textContent = 'New';
        
        // Update action buttons visibility
        ns.pos.updateActionButtonsVisibility();
        
        if (ns.pos.renderOpenSalesStrip) ns.pos.renderOpenSalesStrip();
        if (ns.pos.renderCartTable) ns.pos.renderCartTable();
        if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
        if (notify && ns.ui && typeof ns.ui.showToast === 'function') ns.ui.showToast('New sale', 'Started a new sale.', 'success');
        if (_getEl('product-search')) { _getEl('product-search').focus();}
        
        // Clear any auto-save when explicitly starting new sale
        if (notify && ns.pos.clearAutoSave) ns.pos.clearAutoSave();
    };

    ns.pos.updateActionButtonsVisibility = function () {
        const hasItems = ns.state.currentSale && Array.isArray(ns.state.currentSale.items) && ns.state.currentSale.items.length > 0;
        const hasSaleId = ns.state.currentSale && ns.state.currentSale.id;
        
        const btnNew = _getEl('btn-new-sale');
        const btnHold = _getEl('btn-hold-sale');
        const btnCancel = _getEl('btn-cancel-sale');
        
        if (btnNew) {
            // Show New Sale button always
            btnNew.style.display = 'flex';
        }
        
        if (btnHold) {
            // Show Hold button only when there are items
            btnHold.style.display = hasItems ? 'flex' : 'none';
        }
        
        if (btnCancel) {
            // Show Cancel button when there's a sale ID (open/editing) or items in cart
            btnCancel.style.display = (hasSaleId || hasItems) ? 'flex' : 'none';
        }
    };

    ns.pos.clearCart = function () {
        if (!ns.state.currentSale) return;
        const hadId = !!ns.state.currentSale.id;
        ns.state.currentSale.items = [];
        // If cart had a sale ID and now empty, keep the ID (editing mode) but don't remove from open sales
        // The sale remains in DB as open/closed with its ID intact
        if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
        if (ns.pos.renderCartTable) ns.pos.renderCartTable();
    };

    ns.pos.clampDiscount = function () {
        if (!ns.state.currentSale) return;
        const subtotal = ns.state.currentSale.subtotal || 0;
        if (ns.state.currentSale.discount > subtotal) {
            ns.state.currentSale.discount = subtotal;
            if (ns.elements['input-discount']) ns.elements['input-discount'].value = String(subtotal);
        }
        if (ns.state.currentSale.discount < 0) {
            ns.state.currentSale.discount = 0;
            if (ns.elements['input-discount']) ns.elements['input-discount'].value = '0';
        }
    };

    ns.pos.updateSaleTotals = function () {
        if (!ns.state.currentSale) return;
        let subtotal = 0;
        ns.state.currentSale.items.forEach(it => { subtotal += it.qty * it.price; });
        ns.state.currentSale.subtotal = subtotal;
        ns.pos.clampDiscount();
        ns.state.currentSale.total = Math.max(0, subtotal - (ns.state.currentSale.discount || 0));
        ns.state.currentSale.change = Math.max(0, (ns.state.currentSale.payment || 0) - ns.state.currentSale.total);
        ns.state.currentSale.updatedAt = new Date().toISOString();
        
        // Auto-save current sale to localStorage for recovery after refresh
        ns.pos.autoSaveCurrentSale();

        const els = ns.elements || {};
        const formatMoney = (v) => ns.utils && ns.utils.formatMoney ? ns.utils.formatMoney(v) : ('৳ ' + Number(v || 0).toFixed(2));
        if (_getEl('summary-subtotal')) _getEl('summary-subtotal').textContent = formatMoney(subtotal);
        if (_getEl('summary-total')) _getEl('summary-total').textContent = formatMoney(ns.state.currentSale.total);
        if (_getEl('sale-header-total')) _getEl('sale-header-total').textContent = formatMoney(ns.state.currentSale.total);
        if (_getEl('summary-items-count')) _getEl('summary-items-count').textContent = String(ns.state.currentSale.items.reduce((s, it) => s + it.qty, 0));
        if (_getEl('summary-change')) _getEl('summary-change').textContent = formatMoney(ns.state.currentSale.change);
        
        // Update discount percentage
        if (_getEl('discount-percentage')) {
            const discountPercent = subtotal > 0 ? ((ns.state.currentSale.discount / subtotal) * 100).toFixed(1) : 0;
            _getEl('discount-percentage').textContent = `${discountPercent}%`;
        }
        
        // Only update input fields if user is not actively editing them
        try {
            const active = document.activeElement;
            if (_getEl('input-discount') && active !== _getEl('input-discount')) _getEl('input-discount').value = ns.state.currentSale.discount || 0;
            if (_getEl('input-payment') && active !== _getEl('input-payment')) _getEl('input-payment').value = ns.state.currentSale.payment || 0;
        } catch (e) {
            if (_getEl('input-discount')) _getEl('input-discount').value = ns.state.currentSale.discount || 0;
            if (_getEl('input-payment')) _getEl('input-payment').value = ns.state.currentSale.payment || 0;
        }
    };

    ns.pos.renderCartTable = function () {
        const els = ns.elements || {};
        const tbody = _getEl('cart-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!ns.state.currentSale) {
            syncCartEmptyState(false);
            return;
        }

        const hasItems = Array.isArray(ns.state.currentSale.items) && ns.state.currentSale.items.length > 0;
        syncCartEmptyState(hasItems);
        if (!hasItems) {
            ns.pos.updateSaleTotals();
            return;
        }

        ns.state.currentSale.items.forEach((item, index) => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td'); tdName.classList.add('cart-item-name'); tdName.textContent = item.name; tr.appendChild(tdName);
            const tdQty = document.createElement('td');
            const qtyControls = document.createElement('div'); qtyControls.style.display = 'flex'; qtyControls.style.alignItems = 'center'; qtyControls.style.gap = '4px';
            const btnMinus = document.createElement('button'); btnMinus.type='button'; btnMinus.className='btn btn-ghost btn-lg'; btnMinus.textContent='−'; btnMinus.style.padding='2px 8px'; btnMinus.addEventListener('click', () => ns.pos.changeCartQty(index, -1));
            const spanQty = document.createElement('span'); spanQty.textContent = String(item.qty); spanQty.style.minWidth='18px'; spanQty.style.textAlign='center';
            const btnPlus = document.createElement('button'); btnPlus.type='button'; btnPlus.className='btn btn-ghost btn-lg'; btnPlus.textContent='+'; btnPlus.style.padding='2px 8px'; btnPlus.addEventListener('click', () => ns.pos.changeCartQty(index, 1));
            qtyControls.appendChild(btnMinus); qtyControls.appendChild(spanQty); qtyControls.appendChild(btnPlus); tdQty.appendChild(qtyControls); tr.appendChild(tdQty);
            const tdPrice = document.createElement('td'); tdPrice.textContent = ns.utils ? ns.utils.formatMoney(item.price) : ('৳ ' + item.price.toFixed(2)); tr.appendChild(tdPrice);
            const tdTotal = document.createElement('td'); tdTotal.textContent = ns.utils ? ns.utils.formatMoney(item.qty * item.price) : ('৳ ' + (item.qty * item.price).toFixed(2)); tr.appendChild(tdTotal);
            const tdActions = document.createElement('td'); const btnRemove = document.createElement('button'); btnRemove.type='button'; btnRemove.className='btn btn-ghost btn-lg'; btnRemove.textContent='✕'; btnRemove.addEventListener('click', () => ns.pos.removeCartItem(index)); tdActions.appendChild(btnRemove); tr.appendChild(tdActions);
            tbody.appendChild(tr);
        });

        ns.pos.updateSaleTotals();
        ns.pos.updateActionButtonsVisibility();
    };

    ns.pos.changeCartQty = function (index, delta) {
        if (!ns.state.currentSale || !ns.state.currentSale.items[index]) return;
        const item = ns.state.currentSale.items[index];
        const newQty = item.qty + delta;
        if (newQty <= 0) { ns.pos.removeCartItem(index); return; }
        const product = ns.state.db.products.find(p => p.sku === item.sku);
        if (product && newQty > product.stock) { if (ns.ui) ns.ui.showToast('Stock limit', `Only ${product.stock} in stock.`, 'error'); return; }
        item.qty = newQty; ns.pos.renderCartTable();
    };

    ns.pos.removeCartItem = function (index) {
        if (!ns.state.currentSale || !ns.state.currentSale.items[index]) return;
        ns.state.currentSale.items.splice(index, 1);
        ns.pos.renderCartTable();
    };

    ns.pos.addProductToCart = function (sku, barcodeUsed) {
        if (!ns.state.currentSale) ns.state.currentSale = ns.pos.createEmptySale();
        const product = ns.state.db.products.find(p => p.sku === sku);
        if (!product) return;
        const existing = ns.state.currentSale.items.find(it => it.sku === sku);
        const currentQty = existing ? existing.qty : 0;
        if (currentQty + 1 > product.stock) { if (ns.ui) ns.ui.showToast('Stock limit', `Only ${product.stock} in stock.`, 'error'); return; }
        if (existing) {
            existing.qty += 1;
            // Update barcode if a different one was used
            if (barcodeUsed && !existing.barcode) existing.barcode = barcodeUsed;
        } else {
            ns.state.currentSale.items.push({
                productId: product.id,
                sku: product.sku || null,
                barcode: barcodeUsed || (product.barcode ? product.barcode.split(',')[0].trim() : null),
                name: product.name,
                qty: 1,
                price: product.sellPrice,
                buyPrice: product.buyPrice
            });
        }
        ns.pos.renderCartTable();
    };

    ns.pos.renderProductSearchTable = function () {
        const tbody = (ns.elements && ns.elements['product-table-body']);
        if (!tbody) return;
        tbody.innerHTML = '';
        const query = ((ns.elements && ns.elements['product-search'] && ns.elements['product-search'].value) || '').trim().toLowerCase();
        const products = ns.state.db.products || [];
        const filtered = products.filter(p => { if (!query) return true; const text = (p.name + ' ' + p.sku).toLowerCase(); return text.includes(query); });
        filtered.forEach((p, idx) => {
            const tr = document.createElement('tr'); tr.addEventListener('click', () => ns.pos.addProductToCart(p.sku));
            const tdName = document.createElement('td'); tdName.textContent = p.name; tr.appendChild(tdName);
            const tdSku = document.createElement('td'); tdSku.textContent = p.sku; tr.appendChild(tdSku);
            const tdSell = document.createElement('td'); tdSell.textContent = ns.utils ? ns.utils.formatMoney(p.sellPrice) : ('৳ ' + p.sellPrice.toFixed(2)); tr.appendChild(tdSell);
            const tdStock = document.createElement('td'); tdStock.textContent = String(p.stock); if (p.stock <= (p.lowStockAt || 0)) tdStock.style.color = '#facc15'; tr.appendChild(tdStock);
            const tdBtn = document.createElement('td'); const btn = document.createElement('button'); btn.type='button'; btn.className='btn btn-primary btn-lg'; btn.textContent='Add'; btn.addEventListener('click', ev => { ev.stopPropagation(); ns.pos.addProductToCart(p.sku); }); tdBtn.appendChild(btn); tr.appendChild(tdBtn);
            tbody.appendChild(tr);
        });
    };

    ns.pos.focusProductSearch = function () { if (ns.elements && ns.elements['product-search']) { ns.elements['product-search'].focus(); ns.elements['product-search'].select(); } };

    // Auto-save current sale to localStorage for recovery after refresh
    ns.pos.autoSaveCurrentSale = function () {
        if (!ns.state.currentSale) return;
        try {
            const saleKey = 'litepos_current_sale_autosave';
            // Save complete sale including customer info and sale ID (for editing mode)
            const saleToSave = {
                ...ns.state.currentSale,
                lastModifiedBy: (ns.state.currentUser && ns.state.currentUser.id) || ns.state.currentSale.lastModifiedBy
            };
            localStorage.setItem(saleKey, JSON.stringify(saleToSave));
        } catch (e) {
            console.error('Auto-save failed:', e);
        }
    };

    // Recover auto-saved sale after page refresh
    ns.pos.recoverAutoSavedSale = function () {
        try {
            const saleKey = 'litepos_current_sale_autosave';
            const saved = localStorage.getItem(saleKey);
            if (saved) {
                const sale = JSON.parse(saved);
                if (sale && sale.items && sale.items.length > 0) {
                    ns.state.currentSale = sale;
                    
                    // Restore customer info to UI
                    if (sale.customer && window.LitePos.customers && typeof window.LitePos.customers.setCurrentCustomer === 'function') {
                        window.LitePos.customers.setCurrentCustomer(sale.customer);
                    }
                    
                    // Update sale status and ID display for editing mode
                    const els = ns.elements || {};
                    if (sale.id) {
                        if (_getEl('summary-sale-status')) {
                            const statusText = sale.status === 'closed' ? 'Editing Closed Sale' : (sale.status === 'open' ? 'Editing Open Sale' : 'Editing Sale');
                            _getEl('summary-sale-status').textContent = `${statusText} · ${sale.id}`;
                        }
                        if (_getEl('summary-sale-id-value')) {
                            _getEl('summary-sale-id-value').textContent = sale.id;
                        }
                    } else {
                        if (_getEl('summary-sale-status')) _getEl('summary-sale-status').textContent = 'New Sale';
                        if (_getEl('summary-sale-id-value')) _getEl('summary-sale-id-value').textContent = 'New';
                    }
                    
                    // Ensure cart UI state is properly synced
                    const hasItems = sale.items && sale.items.length > 0;
                    syncCartEmptyState(hasItems);
                    
                    // Initialize receipt size from settings
                    if (ns.pos.initReceiptSize) ns.pos.initReceiptSize();
                    
                    if (ns.pos.renderCartTable) ns.pos.renderCartTable();
                    if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
                    if (ns.pos.updateActionButtonsVisibility) ns.pos.updateActionButtonsVisibility();
                    
                    // Force update cart count chip after DOM is ready
                    setTimeout(() => {
                        const itemCount = sale.items.reduce((sum, it) => sum + (it.qty || 0), 0);
                        const countChip = _getEl('cart-count-chip');
                        
                        if (countChip && itemCount > 0) {
                            countChip.textContent = `${itemCount} item${itemCount === 1 ? '' : 's'}`;
                            countChip.classList.remove('hidden');
                        }
                    }, 100);
                    
                    if (ns.ui) ns.ui.showToast('Sale recovered', 'Previous sale restored after refresh.', 'success');
                    return true;
                }
            }
        } catch (e) {
            console.error('Recovery failed:', e);
        }
        return false;
    };

    // Clear auto-save after completing or canceling sale
    ns.pos.clearAutoSave = function () {
        try {
            const saleKey = 'litepos_current_sale_autosave';
            localStorage.removeItem(saleKey);
        } catch (e) {
            console.error('Clear auto-save failed:', e);
        }
    };

    // Load an open sale for editing
    ns.pos.loadOpenSale = function (saleId) {
        const sale = ns.state.db.sales.find(s => s.id === saleId);
        if (!sale) {
            if (ns.ui) ns.ui.showToast('Load sale', 'Sale not found.', 'error');
            return;
        }

        const activeSaleId = ns.state.currentSale && ns.state.currentSale.id ? ns.state.currentSale.id : null;
        const activeHasItems = ns.state.currentSale && Array.isArray(ns.state.currentSale.items) && ns.state.currentSale.items.length > 0;
        
        // If already editing this sale, just switch to sale tab
        if (activeSaleId === saleId) {
            if (window.switchTab) window.switchTab('tab-sale');
            if (ns.ui) ns.ui.showToast('Load sale', `Sale ${saleId} is already loaded.`, 'info');
            return;
        }

        // If there's a different sale with items, ask to save it first
        if (activeHasItems && activeSaleId && activeSaleId !== saleId) {
            if (!confirm(`Save current sale ${activeSaleId} before loading ${saleId}?`)) {
                return;
            }
            // Hold the current sale
            if (ns.pos.holdCurrentSale) ns.pos.holdCurrentSale();
        }

        // Load the sale
        ns.state.currentSale = ns.utils ? ns.utils.structuredClone(sale) : JSON.parse(JSON.stringify(sale));
        
        // Restore customer
        if (sale.customer && window.LitePos.customers && typeof window.LitePos.customers.setCurrentCustomer === 'function') {
            window.LitePos.customers.setCurrentCustomer(sale.customer);
        }
        
        // Update UI
        const statusLabel = sale.status === 'closed' ? 'Editing Closed Sale' : (sale.status === 'open' ? 'Editing Open Sale' : 'Editing Sale');
        if (_getEl('summary-sale-status')) _getEl('summary-sale-status').textContent = `${statusLabel} · ${sale.id}`;
        if (_getEl('summary-sale-id-value')) _getEl('summary-sale-id-value').textContent = sale.id;
        
        // Render and update
        if (ns.pos.renderCartTable) ns.pos.renderCartTable();
        if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
        if (ns.pos.updateActionButtonsVisibility) ns.pos.updateActionButtonsVisibility();
        
        // Switch to sale tab and focus
        if (window.switchTab) window.switchTab('tab-sale');
        if (ns.pos.focusProductSearch) ns.pos.focusProductSearch();
        
        if (ns.ui) ns.ui.showToast('Sale loaded', `Editing sale ${sale.id}.`, 'success');
    };

    ns.pos.holdCurrentSale = function () {
        if (!ns.state.currentSale || ns.state.currentSale.items.length === 0) {
            if (ns.ui) ns.ui.showToast('Hold sale', 'Cart is empty.', 'error');
            return;
        }
        ns.state.currentSale.status = 'open';
        ns.state.currentSale.updatedAt = new Date().toISOString();
        ns.state.currentSale.lastModifiedBy = (ns.state.currentUser && ns.state.currentUser.id) || ns.state.currentSale.lastModifiedBy;
        const now = new Date().toISOString();
        if (!ns.state.currentSale.id) {
            const newId = 'S' + String(ns.state.db.counters.nextSaleId++).padStart(4, '0');
            ns.state.currentSale.id = newId;
            ns.state.currentSale.createdAt = now;
            ns.state.db.sales.push(ns.utils ? ns.utils.structuredClone(ns.state.currentSale) : JSON.parse(JSON.stringify(ns.state.currentSale)));
        } else {
            const idx = ns.state.db.sales.findIndex(s => s.id === ns.state.currentSale.id);
            if (idx !== -1) {
                ns.state.db.sales[idx] = ns.utils ? ns.utils.structuredClone(ns.state.currentSale) : JSON.parse(JSON.stringify(ns.state.currentSale));
            } else {
                ns.state.db.sales.push(ns.utils ? ns.utils.structuredClone(ns.state.currentSale) : JSON.parse(JSON.stringify(ns.state.currentSale)));
            }
        }
        if (ns.api && typeof ns.api.saveDb === 'function') {
            ns.api.saveDb();
        } else {
            localStorage.setItem(ns.api && ns.api.DB_KEY ? ns.api.DB_KEY : 'litepos_bdt_db_v1', JSON.stringify(ns.state.db));
        }
        const heldId = ns.state.currentSale.id;
        if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
        if (ns.ui) ns.ui.showToast('Sale held', `Sale ${heldId} saved as open.`, 'success');
        if (ns.pos.renderOpenSalesStrip) ns.pos.renderOpenSalesStrip();
        ns.pos.startNewSale(false);
        syncCartEmptyState(false);
    };

    ns.pos.cancelCurrentSale = function () {
        const hasItems = ns.state.currentSale && Array.isArray(ns.state.currentSale.items) && ns.state.currentSale.items.length > 0;
        
        // If cart has items, ask for confirmation
        if (hasItems && !confirm('Discard cart items and cancel sale?')) {
            return;
        }
        
        if (!ns.state.currentSale || !ns.state.currentSale.id) { 
            if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
            ns.pos.startNewSale(false); 
            if (ns.ui) ns.ui.showToast('Sale cleared', 'Cancelled unsaved sale.', 'success'); 
            return; 
        }
        const idx = ns.state.db.sales.findIndex(s => s.id === ns.state.currentSale.id && s.status === 'open');
        if (idx === -1) { 
            if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
            ns.pos.startNewSale(false); 
            return; 
        }
        if (!confirm(`Cancel open sale ${ns.state.currentSale.id}? It will be removed.`)) return;
        ns.state.db.sales.splice(idx, 1);
        if (ns.api && typeof ns.api.saveDb === 'function') ns.api.saveDb(); else localStorage.setItem(ns.api && ns.api.DB_KEY ? ns.api.DB_KEY : 'litepos_bdt_db_v1', JSON.stringify(ns.state.db));
        if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
        ns.pos.startNewSale(false); 
        if (ns.pos.renderOpenSalesStrip) ns.pos.renderOpenSalesStrip(); 
        if (ns.ui) ns.ui.showToast('Sale cancelled', 'Open sale removed.', 'success');
    };

    ns.pos.completeCurrentSale = function () {
        if (!ns.state.currentSale || ns.state.currentSale.items.length === 0) { if (ns.ui) ns.ui.showToast('Complete sale', 'Cart is empty.', 'error'); return; }
        if (!ns.state.currentSale.customer) { const walkIn = ns.state.db.customers.find(c => c.phone === '') || ns.state.db.customers[0]; ns.state.currentSale.customer = walkIn || null; }
        ns.pos.updateSaleTotals();
        if (ns.state.currentSale.total <= 0) { if (ns.ui) ns.ui.showToast('Complete sale', 'Total must be greater than 0.', 'error'); return; }
        if ((ns.state.currentSale.payment || 0) < ns.state.currentSale.total) { if (ns.ui) ns.ui.showToast('Payment insufficient', 'Payment must cover total.', 'error'); return; }
        const now = new Date().toISOString(); ns.state.currentSale.status = 'closed'; ns.state.currentSale.updatedAt = now; if (!ns.state.currentSale.createdAt) ns.state.currentSale.createdAt = now;
        ns.state.currentSale.lastModifiedBy = (ns.state.currentUser && ns.state.currentUser.id) || ns.state.currentSale.lastModifiedBy;
        if (!ns.state.currentSale.id) { const newId = 'S' + String(ns.state.db.counters.nextSaleId++).padStart(4, '0'); ns.state.currentSale.id = newId; }
        ns.state.currentSale.items.forEach(it => { const product = ns.state.db.products.find(p => p.sku === it.sku); if (product) product.stock = Math.max(0, (product.stock || 0) - it.qty); });
        const idx = ns.state.db.sales.findIndex(s => s.id === ns.state.currentSale.id);
        const saleCopy = ns.utils ? ns.utils.structuredClone(ns.state.currentSale) : JSON.parse(JSON.stringify(ns.state.currentSale));
        ns.state.db.sales[idx === -1 ? ns.state.db.sales.length : idx] = saleCopy;
        if (ns.state.currentSale.customer && ns.state.currentSale.customer.phone != null) {
            let customer = ns.state.db.customers.find(c => c.phone === ns.state.currentSale.customer.phone);
            if (!customer) { customer = { id: 'c' + (ns.state.db.customers.length + 1), name: ns.state.currentSale.customer.name || 'Customer', phone: ns.state.currentSale.customer.phone, notes: ns.state.currentSale.customer.notes || '', lastSaleAt: null, lastSaleTotal: 0 }; ns.state.db.customers.push(customer); } else { if (ns.state.currentSale.customer.name) customer.name = ns.state.currentSale.customer.name; }
            customer.lastSaleAt = now; customer.lastSaleTotal = ns.state.currentSale.total;
        }
        if (ns.api && typeof ns.api.saveDb === 'function') ns.api.saveDb(); else localStorage.setItem(ns.api && ns.api.DB_KEY ? ns.api.DB_KEY : 'litepos_bdt_db_v1', JSON.stringify(ns.state.db));
        ns.state.lastClosedSaleId = ns.state.currentSale.id;
        if (ns.elements && ns.elements['summary-sale-status']) ns.elements['summary-sale-status'].textContent = `Closed · ${ns.state.currentSale.id}`;
        if (ns.ui) ns.ui.showToast('Sale completed', `Sale ${ns.state.currentSale.id} closed.`, 'success');
        if (ns.pos.renderCartTable) ns.pos.renderCartTable(); if (ns.pos.renderOpenSalesStrip) ns.pos.renderOpenSalesStrip(); if (ns.pos.renderProductsTable) ns.pos.renderProductsTable && ns.pos.renderProductsTable(); if (ns.pos.renderCustomersTable) ns.pos.renderCustomersTable && ns.pos.renderCustomersTable();
        if (ns.pos.refreshKpis) ns.pos.refreshKpis && ns.pos.refreshKpis(); if (ns.pos.renderSalesTable) ns.pos.renderSalesTable && ns.pos.renderSalesTable();
        if (ns.pos.fillReceiptFromSale) ns.pos.fillReceiptFromSale && ns.pos.fillReceiptFromSale(saleCopy);
        
        // Clear auto-save after completing sale
        if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
        
        ns.pos.startNewSale(true); 
        if (ns.pos.renderTodaySnapshot) ns.pos.renderTodaySnapshot && ns.pos.renderTodaySnapshot();
    };

    // Fill receipt with sale data
    ns.pos.fillReceiptFromSale = function (sale) {
        console.log('[fillReceiptFromSale] Called with sale:', sale);
        if (!sale) {
            console.error('[fillReceiptFromSale] No sale provided!');
            return;
        }
        
        const formatMoney = (v) => ns.utils && ns.utils.formatMoney ? ns.utils.formatMoney(v) : ('৳ ' + Number(v || 0).toFixed(2));
        
        // Determine which template to use
        const settings = ns.state.db.settings || {};
        const template = settings.defaultPrintTemplate || 'standard';
        const isCompact = template === 'compact';
        
        // Shop details - fill both templates
        const shopName = _getEl(isCompact ? 'receipt-shop-name-compact' : 'receipt-shop-name');
        const shopAddress = _getEl(isCompact ? 'receipt-shop-address-compact' : 'receipt-shop-address');
        const shopPhone = _getEl(isCompact ? 'receipt-shop-phone-compact' : 'receipt-shop-phone');
        const logoEl = _getEl(isCompact ? 'receipt-logo-compact' : 'receipt-logo-standard');
        
        console.log('[fillReceiptFromSale] Shop elements:', { shopName, shopAddress, shopPhone, logoEl });
        
        if (shopName) shopName.textContent = ns.state.db.shop?.name || 'LitePOS';
        if (shopAddress) shopAddress.textContent = ns.state.db.shop?.address || '';
        if (shopPhone) shopPhone.textContent = ns.state.db.shop?.phone || '';
        
        // Display logo if available
        if (logoEl && ns.state.db.shop?.logo) {
            logoEl.src = ns.state.db.shop.logo;
            logoEl.style.display = 'block';
        } else if (logoEl) {
            logoEl.style.display = 'none';
        }
        
        // Sale metadata
        const saleMeta = _getEl(isCompact ? 'receipt-sale-meta-compact' : 'receipt-sale-meta');
        if (saleMeta) {
            const saleDate = new Date(sale.createdAt || sale.updatedAt || new Date());
            
            // Format date and time in configured timezone
            let dateStr, timeStr;
            if (ns.utils && typeof ns.utils.formatTimeInTimezone === 'function') {
                // Use timezone-aware formatting
                const localDate = ns.utils.utcToLocal(saleDate);
                dateStr = localDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC' // Display using UTC since we already adjusted the time
                });
                timeStr = ns.utils.formatTimeInTimezone(saleDate, { hour12: true });
            } else {
                // Fallback to browser timezone
                dateStr = saleDate.toLocaleDateString();
                timeStr = saleDate.toLocaleTimeString();
            }
            
            const customerName = sale.customer?.name || 'Walk-in';
            const salesperson = ns.state.db.users?.find(u => u.id === sale.salespersonId);
            
            saleMeta.innerHTML = `
                <div><strong>Sale ID:</strong> ${sale.id || 'N/A'}</div>
                <div><strong>Date:</strong> ${dateStr} ${timeStr}</div>
                <div><strong>Customer:</strong> ${customerName}</div>
                ${salesperson ? `<div><strong>Salesperson:</strong> ${salesperson.name}</div>` : ''}
            `;
            console.log('[fillReceiptFromSale] Sale meta filled:', saleMeta.innerHTML);
        }
        
        // Items table
        const itemsBody = _getEl(isCompact ? 'receipt-items-body-compact' : 'receipt-items-body');
        console.log('[fillReceiptFromSale] Items body element:', itemsBody, 'Items count:', sale.items?.length);
        if (itemsBody) {
            itemsBody.innerHTML = '';
            (sale.items || []).forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.name}</td>
                    <td>${item.qty}</td>
                    <td>${formatMoney(item.price)}</td>
                    <td>${formatMoney(item.qty * item.price)}</td>
                `;
                itemsBody.appendChild(tr);
            });
            console.log('[fillReceiptFromSale] Items filled. Row count:', itemsBody.children.length);
        }
        
        // Totals
        const suffix = isCompact ? '-compact' : '';
        if (_getEl('receipt-subtotal' + suffix)) _getEl('receipt-subtotal' + suffix).textContent = formatMoney(sale.subtotal || 0);
        if (_getEl('receipt-discount' + suffix)) _getEl('receipt-discount' + suffix).textContent = formatMoney(sale.discount || 0);
        if (_getEl('receipt-total' + suffix)) _getEl('receipt-total' + suffix).textContent = formatMoney(sale.total || 0);
        if (_getEl('receipt-payment' + suffix)) _getEl('receipt-payment' + suffix).textContent = formatMoney(sale.payment || 0);
        if (_getEl('receipt-change' + suffix)) _getEl('receipt-change' + suffix).textContent = formatMoney(sale.change || 0);
        
        console.log('[fillReceiptFromSale] Receipt filled successfully');
    };
    
    // Print last receipt
    ns.pos.printLastReceipt = function () {
        console.log('[printLastReceipt] Starting...');
        let saleId = ns.state.lastClosedSaleId;
        console.log('[printLastReceipt] lastClosedSaleId:', saleId);
        
        if (!saleId) {
            // Find the most recent closed sale
            const closedSales = ns.state.db.sales.filter(s => s.status === 'closed');
            console.log('[printLastReceipt] Found closed sales:', closedSales.length);
            if (closedSales.length === 0) {
                if (ns.ui) ns.ui.showToast('Print', 'No closed sale to print.', 'error');
                return;
            }
            closedSales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            saleId = closedSales[0].id;
            console.log('[printLastReceipt] Using most recent closed sale:', saleId);
        }
        
        const sale = ns.state.db.sales.find(s => s.id === saleId);
        console.log('[printLastReceipt] Found sale:', sale);
        if (!sale) {
            if (ns.ui) ns.ui.showToast('Print', 'Last sale not found.', 'error');
            return;
        }
        
        // Fill receipt
        ns.pos.fillReceiptFromSale(sale);
        
        // Get settings from UI dropdown and global settings
        const settings = ns.state.db.settings || {};
        const template = settings.defaultPrintTemplate || 'standard';
        // Use the selected value from receipt-size dropdown, not global settings
        const receiptSizeEl = _getEl('receipt-size');
        const size = (receiptSizeEl && receiptSizeEl.value) || 'a4';
        console.log('[printLastReceipt] Template:', template, 'Size:', size);
        
        // Show/hide templates
        const standardTemplate = _getEl('receipt-standard');
        const compactTemplate = _getEl('receipt-compact');
        if (standardTemplate) standardTemplate.style.display = (template === 'standard') ? 'block' : 'none';
        if (compactTemplate) compactTemplate.style.display = (template === 'compact') ? 'block' : 'none';
        
        // Add print classes
        document.body.classList.add('print-receipt');
        document.body.classList.add(
            size === '80mm' ? 'receipt-80mm' :
            size === '58mm' ? 'receipt-58mm' : 'receipt-a4'
        );
        
        console.log('[printLastReceipt] Added body classes:', document.body.className);
        console.log('[printLastReceipt] Receipt element display:', getComputedStyle(_getEl('receipt-print')).display);
        
        // Print
        setTimeout(() => {
            console.log('[printLastReceipt] Calling window.print()');
            window.print();
        }, 200);
        
        // Cleanup after print
        setTimeout(() => {
            document.body.classList.remove('print-receipt', 'receipt-a4', 'receipt-80mm', 'receipt-58mm');
            console.log('[printLastReceipt] Cleanup done');
        }, 1000);
    };

    // expose some helpers used by other modules
    ns.pos.initReceiptSize = ns.pos.initReceiptSize || function () {};
    ns.pos.renderOpenSalesStrip = ns.pos.renderOpenSalesStrip || function () {};
    ns.pos.renderProductsTable = ns.pos.renderProductsTable || function () {};
    ns.pos.renderCustomersTable = ns.pos.renderCustomersTable || function () {};
    ns.pos.refreshKpis = ns.pos.refreshKpis || function () {};
    ns.pos.renderSalesTable = ns.pos.renderSalesTable || function () {};
    ns.pos.renderTodaySnapshot = ns.pos.renderTodaySnapshot || function () {};

})();
