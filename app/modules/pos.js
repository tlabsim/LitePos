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

    ns.pos.startNewSale = function (notify) {
        // Check for auto-saved sale first
        if (!notify && ns.pos.recoverAutoSavedSale && ns.pos.recoverAutoSavedSale()) {
            return; // Sale recovered, don't create new one
        }
        
        ns.state.currentSale = ns.pos.createEmptySale();
        ns.state.currentSale.customer = null;
        const els = ns.elements || {};
        if (els['input-discount']) els['input-discount'].value = '0';
        if (els['input-payment']) els['input-payment'].value = '0';
        if (els['cart-table-body']) els['cart-table-body'].innerHTML = '';
        syncCartEmptyState(false);
        if (els['summary-sale-status']) els['summary-sale-status'].textContent = 'New';
        if (els['summary-sale-id-value']) els['summary-sale-id-value'].textContent = 'New';
        if (ns.pos.renderOpenSalesStrip) ns.pos.renderOpenSalesStrip();
        if (ns.pos.renderCartTable) ns.pos.renderCartTable();
        if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
        if (notify && ns.ui && typeof ns.ui.showToast === 'function') ns.ui.showToast('New sale', 'Started a new sale.', 'success');
        if (els['product-search']) { els['product-search'].focus();}
        
        // Clear any auto-save when explicitly starting new sale
        if (notify && ns.pos.clearAutoSave) ns.pos.clearAutoSave();
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
        console.log('[updateSaleTotals MODULE] After calculations:');
        console.log('  - subtotal:', subtotal);
        console.log('  - total:', ns.state.currentSale.total);
        console.log('  - payment:', ns.state.currentSale.payment);
        console.log('  - change:', ns.state.currentSale.change);
        
        // Auto-save current sale to localStorage for recovery after refresh
        ns.pos.autoSaveCurrentSale();

        const els = ns.elements || {};
        const formatMoney = (v) => ns.utils && ns.utils.formatMoney ? ns.utils.formatMoney(v) : ('৳ ' + Number(v || 0).toFixed(2));
        if (els['summary-subtotal']) els['summary-subtotal'].textContent = formatMoney(subtotal);
        if (els['summary-total']) els['summary-total'].textContent = formatMoney(ns.state.currentSale.total);
        if (els['sale-header-total']) els['sale-header-total'].textContent = formatMoney(ns.state.currentSale.total);
        if (els['summary-items-count']) els['summary-items-count'].textContent = String(ns.state.currentSale.items.reduce((s, it) => s + it.qty, 0));
        if (els['summary-change']) els['summary-change'].textContent = formatMoney(ns.state.currentSale.change);
        
        // Update discount percentage
        if (getElement('discount-percentage')) {
            console.log('[updateSaleTotals MODULE] Updating discount percentage display');
            const discountPercent = subtotal > 0 ? ((ns.state.currentSale.discount / subtotal) * 100).toFixed(1) : 0;
            els['discount-percentage'].textContent = `${discountPercent}%`;
        }
        
        // Only update input fields if user is not actively editing them
        try {
            const active = document.activeElement;
            if (els['input-discount'] && active !== els['input-discount']) els['input-discount'].value = ns.state.currentSale.discount || 0;
            if (els['input-payment'] && active !== els['input-payment']) els['input-payment'].value = ns.state.currentSale.payment || 0;
        } catch (e) {
            if (els['input-discount']) els['input-discount'].value = ns.state.currentSale.discount || 0;
            if (els['input-payment']) els['input-payment'].value = ns.state.currentSale.payment || 0;
        }
    };

    ns.pos.renderCartTable = function () {
        const els = ns.elements || {};
        const tbody = els['cart-table-body'];
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

    ns.pos.addProductToCart = function (sku) {
        if (!ns.state.currentSale) ns.state.currentSale = ns.pos.createEmptySale();
        const product = ns.state.db.products.find(p => p.sku === sku);
        if (!product) return;
        const existing = ns.state.currentSale.items.find(it => it.sku === sku);
        const currentQty = existing ? existing.qty : 0;
        if (currentQty + 1 > product.stock) { if (ns.ui) ns.ui.showToast('Stock limit', `Only ${product.stock} in stock.`, 'error'); return; }
        if (existing) existing.qty += 1; else ns.state.currentSale.items.push({ sku: product.sku, name: product.name, qty: 1, price: product.sellPrice, buyPrice: product.buyPrice });
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
                        if (els['summary-sale-status']) {
                            const statusText = sale.status === 'closed' ? 'Closed' : (sale.status === 'open' ? 'Open' : 'Editing');
                            els['summary-sale-status'].textContent = `${statusText} · ${sale.id}`;
                        }
                        if (els['summary-sale-id-value']) {
                            els['summary-sale-id-value'].textContent = sale.id;
                        }
                    }
                    
                    if (ns.pos.renderCartTable) ns.pos.renderCartTable();
                    if (ns.pos.updateSaleTotals) ns.pos.updateSaleTotals();
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
        if (!ns.state.currentSale || !ns.state.currentSale.id) { 
            if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
            ns.pos.startNewSale(true); 
            if (ns.ui) ns.ui.showToast('Sale cleared', 'Cancelled unsaved sale.', 'success'); 
            return; 
        }
        const idx = ns.state.db.sales.findIndex(s => s.id === ns.state.currentSale.id && s.status === 'open');
        if (idx === -1) { 
            if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
            ns.pos.startNewSale(true); 
            return; 
        }
        if (!confirm(`Cancel open sale ${ns.state.currentSale.id}? It will be removed.`)) return;
        ns.state.db.sales.splice(idx, 1);
        if (ns.api && typeof ns.api.saveDb === 'function') ns.api.saveDb(); else localStorage.setItem(ns.api && ns.api.DB_KEY ? ns.api.DB_KEY : 'litepos_bdt_db_v1', JSON.stringify(ns.state.db));
        if (ns.pos.clearAutoSave) ns.pos.clearAutoSave();
        ns.pos.startNewSale(true); 
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

    // expose some helpers used by other modules
    ns.pos.renderOpenSalesStrip = ns.pos.renderOpenSalesStrip || function () {};
    ns.pos.renderProductsTable = ns.pos.renderProductsTable || function () {};
    ns.pos.renderCustomersTable = ns.pos.renderCustomersTable || function () {};
    ns.pos.refreshKpis = ns.pos.refreshKpis || function () {};
    ns.pos.renderSalesTable = ns.pos.renderSalesTable || function () {};
    ns.pos.fillReceiptFromSale = ns.pos.fillReceiptFromSale || function () {};
    ns.pos.renderTodaySnapshot = ns.pos.renderTodaySnapshot || function () {};

})();
