/* Products module for LitePos
   Provides product listing, search and CRUD helpers and exposes them on window.LitePos.products
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
    // For dynamic elements - always fresh lookup, no caching (elements may be destroyed/recreated)
    function _getById(id) {
        return document.getElementById(id);
    }
    function _showToast(title, msg, type) {
        if (UI && typeof UI.showToast === 'function') return UI.showToast(title, msg, type);
        if (typeof window.showToast === 'function') return window.showToast(title, msg, type);
        console[type === 'error' ? 'error' : 'log'](title + ': ' + (msg || ''));
    }

    function formatMoney(v) { if (UTILS && typeof UTILS.formatMoney === 'function') return UTILS.formatMoney(v); const n = Number(v || 0); return '৳ ' + n.toFixed(2); }
    
    function formatProductId(id) {
        if (typeof window.formatProductId === 'function') return window.formatProductId(id);
        const match = id.match(/\d+/);
        if (match) {
            const num = parseInt(match[0], 10);
            return 'P' + String(num).padStart(5, '0');
        }
        return id;
    }

    function _addToCart(sku) {
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.addProductToCart === 'function') {
            try { return window.LitePos.pos.addProductToCart(sku); } catch (e) { console.error(e); }
        }
        if (typeof window.addProductToCart === 'function') {
            try { return window.addProductToCart(sku); } catch (e) { console.error(e); }
        }
        console.warn('add to cart not available for SKU', sku);
    }

    // After adding to cart from overlay, close overlay unless "all products" toggle is active
    function _addToCartAndMaybeClose(sku) {
        _addToCart(sku);
        const els = _getEls();
        const overlay = _getById('product-overlay');
        const toggle = _getEl('toggle-all-products');
        let showAll = false;
        if (toggle) {
            if (toggle.tagName === 'INPUT') showAll = !!toggle.checked;
            else showAll = (toggle.getAttribute('aria-pressed') === 'true') || toggle.classList.contains('active');
        }
        if (overlay && !showAll) overlay.classList.add('hidden');

        const search = _getEl('product-search');
        if (search) {
            const hadValue = search.value !== '';
            search.value = '';
            search.focus();
            if (hadValue && typeof window.renderProductSearchTable === 'function') {
                window.renderProductSearchTable();
            }
        }
    }


    function renderProductsTable() {
        const els = _getEls();
        const db = _getDb();
        const tbody = _getEl('products-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const query = (_getEl('product-manage-search') && _getEl('product-manage-search').value || '').trim().toLowerCase();
        const categoryFilter = _getEl('product-filter-category') ? _getEl('product-filter-category').value : '';
        const brandFilter = _getEl('product-filter-brand') ? _getEl('product-filter-brand').value : '';
        const supplierFilter = _getEl('product-filter-supplier') ? _getEl('product-filter-supplier').value : '';
        const lowStockOnly = _getEl('product-filter-low-stock') ? _getEl('product-filter-low-stock').checked : false;
        const sortBy = _getEl('product-sort') ? _getEl('product-sort').value : 'name-asc';

        let allProducts = (db.products || []).slice();
        
        // Apply search filter
        let filtered = allProducts.filter(p => {
            if (query) {
                // Check name, SKU, category, brand, supplier
                const nameMatch = (p.name || '').toLowerCase().includes(query);
                const skuMatch = (p.sku || '').toLowerCase().includes(query);
                const categoryMatch = (p.category || '').toLowerCase().includes(query);
                const brandMatch = (p.brand || '').toLowerCase().includes(query);
                const supplierMatch = (p.supplier || '').toLowerCase().includes(query);
                
                // Check each barcode using substring matching
                const barcodes = (p.barcode || '').split(',').map(b => b.trim().toLowerCase());
                const barcodeMatch = barcodes.some(bc => bc.includes(query));
                
                if (!(nameMatch || skuMatch || categoryMatch || brandMatch || supplierMatch || barcodeMatch)) {
                    return false;
                }
            }
            return true;
        });
        
        // Apply category filter
        if (categoryFilter) {
            filtered = filtered.filter(p => p.category === categoryFilter);
        }
        
        // Apply brand filter
        if (brandFilter) {
            filtered = filtered.filter(p => p.brand === brandFilter);
        }
        
        // Apply supplier filter
        if (supplierFilter) {
            filtered = filtered.filter(p => p.supplier === supplierFilter);
        }
        
        // Apply low stock filter
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
        
        // Update badge with total product count (always show all products)
        if (_getEl('product-count-badge')) {
            _getEl('product-count-badge').textContent = `${allProducts.length} products`;
        }
        
        // Update pagination text with filtered count
        const totalFiltered = filtered.length;
        if (_getEl('product-total-count')) {
            if (lowStockOnly && totalFiltered === 0) {
                _getEl('product-total-count').textContent = 'No low stock items';
            } else if (lowStockOnly) {
                _getEl('product-total-count').textContent = `${totalFiltered} low stock ${totalFiltered === 1 ? 'item' : 'items'} | Showing page 1 of 1`;
            } else {
                _getEl('product-total-count').textContent = `${totalFiltered} total | Showing page 1 of 1`;
            }
        }
        
        // Disable/enable pagination buttons (no pagination in module version for now)
        if (_getEl('btn-product-prev-page')) {
            _getEl('btn-product-prev-page').disabled = true;
        }
        if (_getEl('btn-product-next-page')) {
            _getEl('btn-product-next-page').disabled = true;
        }
        
        // Render filtered products
        filtered.forEach(p => {
            const tr = document.createElement('tr');
            if (p.stock <= (p.lowStockAt || 0)) tr.classList.add('low-stock-row');
            tr.addEventListener('click', () => loadProductToForm(p.id));

            const tdId = document.createElement('td'); 
            tdId.textContent = formatProductId(p.id); 
            tdId.style.fontFamily = 'monospace'; 
            tdId.style.fontSize = '12px'; 
            tdId.style.color = 'var(--text-soft)'; 
            tr.appendChild(tdId);
            
            const tdName = document.createElement('td'); 
            tdName.textContent = p.name; 
            tdName.style.fontSize = '14px';
            tdName.style.fontWeight = '600';
            tr.appendChild(tdName);
            
            const tdSku = document.createElement('td'); 
            tdSku.textContent = p.sku; 
            tr.appendChild(tdSku);
            
            const tdBarcode = document.createElement('td'); 
            tdBarcode.className = 'barcode-cell';
            tdBarcode.textContent = p.barcode || '—'; 
            tdBarcode.style.fontSize = '12px'; 
            tdBarcode.title = p.barcode || ''; // Show full barcode on hover
            tr.appendChild(tdBarcode);
            
            const tdCategory = document.createElement('td'); 
            tdCategory.textContent = p.category || '—'; 
            tdCategory.style.fontSize = '12px'; 
            tr.appendChild(tdCategory);
            
            const tdBrand = document.createElement('td'); 
            tdBrand.textContent = p.brand || '—'; 
            tdBrand.style.fontSize = '12px'; 
            tr.appendChild(tdBrand);
            
            const tdSupplier = document.createElement('td'); 
            tdSupplier.textContent = p.supplier || '—'; 
            tdSupplier.style.fontSize = '12px'; 
            tr.appendChild(tdSupplier);
            
            const tdBuy = document.createElement('td'); 
            tdBuy.textContent = formatMoney(p.buyPrice); 
            tr.appendChild(tdBuy);
            
            const tdSell = document.createElement('td'); 
            tdSell.textContent = formatMoney(p.sellPrice); 
            tr.appendChild(tdSell);
            
            const tdStock = document.createElement('td'); 
            tdStock.textContent = String(p.stock); 
            tr.appendChild(tdStock);
            
            // const tdLow = document.createElement('td'); 
            // tdLow.textContent = p.stock <= (p.lowStockAt || 0) ? 'Yes' : ''; 
            // tr.appendChild(tdLow);

            tbody.appendChild(tr);
        });
        
        // Update dropdowns and datalists
        updateCategoryDropdown();
        updateBrandDropdown();
        updateSupplierDropdown();
        updateCategorySuggestions();
        updateBrandSuggestions();
        updateSupplierSuggestions();
    }
    
    function updateCategoryDropdown() {
        const els = _getEls();
        const db = _getDb();
        if (!_getEl('product-filter-category')) return;
        
        const categories = [...new Set(db.products.map(p => p.category).filter(c => c))].sort();
        const currentValue = _getEl('product-filter-category').value;
        
        _getEl('product-filter-category').innerHTML = '<option value="">All Categories</option>';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            _getEl('product-filter-category').appendChild(opt);
        });
        
        // Restore selected value if it still exists
        if (currentValue && categories.includes(currentValue)) {
            _getEl('product-filter-category').value = currentValue;
        }
    }

    function updateBrandDropdown() {
        const els = _getEls();
        const db = _getDb();
        if (!_getEl('product-filter-brand')) return;
        
        const brands = [...new Set(db.products.map(p => p.brand).filter(b => b))].sort();
        const currentValue = _getEl('product-filter-brand').value;
        
        _getEl('product-filter-brand').innerHTML = '<option value="">All Brands</option>';
        brands.forEach(brand => {
            const opt = document.createElement('option');
            opt.value = brand;
            opt.textContent = brand;
            _getEl('product-filter-brand').appendChild(opt);
        });
        
        // Restore selected value if it still exists
        if (currentValue && brands.includes(currentValue)) {
            _getEl('product-filter-brand').value = currentValue;
        }
    }

    function updateSupplierDropdown() {
        const els = _getEls();
        const db = _getDb();
        if (!_getEl('product-filter-supplier')) return;
        
        const suppliers = [...new Set(db.products.map(p => p.supplier).filter(s => s))].sort();
        const currentValue = _getEl('product-filter-supplier').value;
        
        _getEl('product-filter-supplier').innerHTML = '<option value="">All Suppliers</option>';
        suppliers.forEach(supplier => {
            const opt = document.createElement('option');
            opt.value = supplier;
            opt.textContent = supplier;
            _getEl('product-filter-supplier').appendChild(opt);
        });
        
        // Restore selected value if it still exists
        if (currentValue && suppliers.includes(currentValue)) {
            _getEl('product-filter-supplier').value = currentValue;
        }
    }

    function updateCategorySuggestions() {
        const els = _getEls();
        const db = _getDb();
        const datalist = document.getElementById('category-suggestions');
        if (!datalist) return;
        
        const categories = [...new Set(db.products.map(p => p.category).filter(c => c))].sort();
        datalist.innerHTML = '';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            datalist.appendChild(opt);
        });
    }

    function updateBrandSuggestions() {
        const els = _getEls();
        const db = _getDb();
        const datalist = document.getElementById('brand-suggestions');
        if (!datalist) return;
        
        const brands = [...new Set(db.products.map(p => p.brand).filter(b => b))].sort();
        datalist.innerHTML = '';
        brands.forEach(brand => {
            const opt = document.createElement('option');
            opt.value = brand;
            datalist.appendChild(opt);
        });
    }

    function updateSupplierSuggestions() {
        const els = _getEls();
        const db = _getDb();
        const datalist = document.getElementById('supplier-suggestions');
        if (!datalist) return;
        
        const suppliers = [...new Set(db.products.map(p => p.supplier).filter(s => s))].sort();
        datalist.innerHTML = '';
        suppliers.forEach(supplier => {
            const opt = document.createElement('option');
            opt.value = supplier;
            datalist.appendChild(opt);
        });
    }

    function renderProductSearchTable() {
        const els = _getEls();
        const db = _getDb();
        const query = (_getEl('product-search') && _getEl('product-search').value || '').trim().toLowerCase();
        const toggleEl = _getEl('toggle-all-products');
        let showAll = false;
        if (toggleEl) {
            if (toggleEl.tagName === 'INPUT') showAll = !!toggleEl.checked;
            else showAll = (toggleEl.getAttribute('aria-pressed') === 'true') || toggleEl.classList.contains('active');
        }

        const products = db.products || [];
        const filtered = products.filter(p => {
            if (!query) return true;
            
            // Check name, SKU, category
            const nameMatch = (p.name || '').toLowerCase().includes(query);
            const skuMatch = (p.sku || '').toLowerCase().includes(query);
            const categoryMatch = (p.category || '').toLowerCase().includes(query);
            
            // Check each barcode using substring matching
            const barcodes = (p.barcode || '').split(',').map(b => b.trim().toLowerCase());
            const barcodeMatch = barcodes.some(bc => bc.includes(query));
            
            return nameMatch || skuMatch || categoryMatch || barcodeMatch;
        });

        // Handle product overlay rendering
        if (_getById('product-overlay')) {
            const overlay = _getById('product-overlay');
            const overlayInner = overlay.querySelector('.product-overlay-inner');
            
            if (query.length > 0 || showAll) {
                overlay.classList.remove('hidden');
                
                // Show empty state if no results
                if (filtered.length === 0) {
                    if (overlayInner) {
                        overlayInner.innerHTML = `
                            <div style="padding: 40px 20px; text-align: center; color: var(--text-soft);">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 48px; height: 48px; margin: 0 auto 12px; opacity: 0.5;">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                </svg>
                                <div style="font-size: 15px; font-weight: 500; margin-bottom: 4px;">No products found</div>
                                <div style="font-size: 13px; opacity: 0.7;">Try a different search term</div>
                            </div>
                        `;
                    }
                    return; // Exit early for empty state
                } else {
                    // Restore table structure if needed
                    const existingTable = overlayInner?.querySelector('table');
                    if (overlayInner && !existingTable) {
                        overlayInner.innerHTML = `
                            <table>
                                <thead>
                                    <tr><th>Product</th><th>SKU</th><th>Barcode</th><th>Category</th><th>Sell</th><th>Stock</th><th></th></tr>
                                </thead>
                                <tbody id="product-overlay-body"></tbody>
                            </table>
                        `;
                    }
                }
            } else {
                overlay.classList.add('hidden');
            }
        }

        // Get tbody element (after potentially restoring table structure)
        const overlayBody = _getById('product-overlay-body');
        const tbody = overlayBody || _getEl('product-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        filtered.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.dataset.sku = p.sku;
            tr.dataset.index = idx;
            tr.addEventListener('click', () => _addToCartAndMaybeClose(p.sku));

            const tdName = document.createElement('td'); tdName.textContent = p.name; tr.appendChild(tdName);
            const tdSku = document.createElement('td'); tdSku.textContent = p.sku; tr.appendChild(tdSku);
            const tdBarcode = document.createElement('td'); 
            tdBarcode.className = 'barcode-cell';
            tdBarcode.textContent = p.barcode || '—'; 
            tdBarcode.style.fontSize = '12px'; 
            tdBarcode.style.color = 'var(--text-soft)'; 
            tdBarcode.title = p.barcode || ''; // Show full barcode on hover
            tr.appendChild(tdBarcode);
            const tdCategory = document.createElement('td'); tdCategory.textContent = p.category || '—'; tdCategory.style.fontSize = '12px'; tr.appendChild(tdCategory);
            const tdSell = document.createElement('td'); tdSell.textContent = formatMoney(p.sellPrice); tr.appendChild(tdSell);
            const tdStock = document.createElement('td'); tdStock.textContent = String(p.stock); if (p.stock <= (p.lowStockAt || 0)) tdStock.style.color = '#facc15'; tr.appendChild(tdStock);

            const tdBtn = document.createElement('td');
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-primary btn-lg'; btn.textContent = 'Add';
            btn.addEventListener('click', ev => { ev.stopPropagation(); _addToCartAndMaybeClose(p.sku); });
            tdBtn.appendChild(btn); tr.appendChild(tdBtn);

            tbody.appendChild(tr);
        });

        // Ensure toggle binds to re-render (support checkbox or button)
        if (_getById('product-overlay')) {
            if (toggleEl && !toggleEl._productsToggleBound) {
                toggleEl._productsToggleBound = true;
                if (toggleEl.tagName === 'INPUT') {
                    toggleEl.addEventListener('change', () => renderProductSearchTable());
                } else {
                    toggleEl.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        const pressed = toggleEl.getAttribute('aria-pressed') === 'true';
                        toggleEl.setAttribute('aria-pressed', pressed ? 'false' : 'true');
                        toggleEl.classList.toggle('active');
                        renderProductSearchTable();
                    });
                }
            }

            // Add keyboard navigation to product search input
            const searchInput = _getEl('product-search');
            const overlayBody = _getById('product-overlay-body');
            if (searchInput && overlayBody && !searchInput._keyboardNavBound) {
                searchInput._keyboardNavBound = true;
                searchInput.addEventListener('keydown', (ev) => {
                    const rows = Array.from(overlayBody.querySelectorAll('tr'));
                    if (rows.length === 0) return;

                    // Enter: add selected or only product
                    if (ev.key === 'Enter') {
                        ev.preventDefault();
                        const selected = overlayBody.querySelector('tr.selected');
                        if (selected) {
                            _addToCartAndMaybeClose(selected.dataset.sku);
                        } else if (rows.length === 1) {
                            // If only one result, add it
                            _addToCartAndMaybeClose(rows[0].dataset.sku);
                        }
                        return;
                    }

                    // Arrow down: select next
                    if (ev.key === 'ArrowDown') {
                        ev.preventDefault();
                        const selected = overlayBody.querySelector('tr.selected');
                        if (!selected) {
                            rows[0].classList.add('selected');
                        } else {
                            const idx = parseInt(selected.dataset.index);
                            selected.classList.remove('selected');
                            if (idx < rows.length - 1) {
                                rows[idx + 1].classList.add('selected');
                            } else {
                                rows[0].classList.add('selected');
                            }
                        }
                        return;
                    }

                    // Arrow up: select previous
                    if (ev.key === 'ArrowUp') {
                        ev.preventDefault();
                        const selected = overlayBody.querySelector('tr.selected');
                        if (!selected) {
                            rows[rows.length - 1].classList.add('selected');
                        } else {
                            const idx = parseInt(selected.dataset.index);
                            selected.classList.remove('selected');
                            if (idx > 0) {
                                rows[idx - 1].classList.add('selected');
                            } else {
                                rows[rows.length - 1].classList.add('selected');
                            }
                        }
                        return;
                    }
                });
            }
        }
    }

    function loadProductToForm(id) {
        const els = _getEls();
        const db = _getDb();
        const p = db.products.find(pp => pp.id === id);
        if (!p) return;
        if (_getEl('product-edit-name')) _getEl('product-edit-name').value = p.name;
        if (_getEl('product-edit-sku')) _getEl('product-edit-sku').value = p.sku || '';
        
        // Load barcodes into tag input
        if (p.barcode) {
            const barcodeList = p.barcode.split(',').map(b => b.trim()).filter(b => b);
            setBarcodes(barcodeList);
        } else {
            setBarcodes([]);
        }
        
        if (_getEl('product-edit-category')) _getEl('product-edit-category').value = p.category || '';
        if (_getEl('product-edit-brand')) _getEl('product-edit-brand').value = p.brand || '';
        if (_getEl('product-edit-supplier')) _getEl('product-edit-supplier').value = p.supplier || '';
        if (_getEl('product-edit-buy')) _getEl('product-edit-buy').value = p.buyPrice;
        if (_getEl('product-edit-sell')) _getEl('product-edit-sell').value = p.sellPrice;
        if (_getEl('product-edit-stock')) _getEl('product-edit-stock').value = p.stock;
        if (_getEl('product-edit-low')) _getEl('product-edit-low').value = p.lowStockAt || 0;
        if (_getEl('product-edit-name')) _getEl('product-edit-name').dataset.productId = p.id;
        
        // Disable stock input for existing products
        if (_getEl('product-edit-stock')) {
            _getEl('product-edit-stock').disabled = true;
            _getEl('product-edit-stock').style.backgroundColor = 'var(--bg-soft)';
            _getEl('product-edit-stock').style.cursor = 'not-allowed';
        }
        
        // Show stock adjustment card and updates log
        if (_getEl('stock-adjustment-card')) {
            console.log('[Module] Showing stock adjustment card for product:', id);
            _getEl('stock-adjustment-card').style.display = 'block';
            if (_getEl('stock-current-value')) {
                _getEl('stock-current-value').textContent = p.stock;
            }
            if (_getEl('stock-adjustment-date')) {
                _getEl('stock-adjustment-date').value = new Date().toISOString().split('T')[0];
            }
        }
        if (_getEl('stock-updates-card')) {
            console.log('[Module] Showing stock updates card for product:', id);
            _getEl('stock-updates-card').style.display = 'block';
            if (typeof window.renderStockUpdatesTable === 'function') {
                console.log('[Module] Calling renderStockUpdatesTable');
                window.renderStockUpdatesTable(id);
            } else {
                console.warn('[Module] window.renderStockUpdatesTable not found');
            }
        }
        
        // Show delete button for existing products
        if (_getEl('btn-delete-product')) {
            _getEl('btn-delete-product').style.display = 'inline-block';
        }
    }

    function clearProductForm() {
        const els = _getEls();
        if (_getEl('product-edit-name')) _getEl('product-edit-name').value = '';
        if (_getEl('product-edit-sku')) _getEl('product-edit-sku').value = '';
        
        // Clear barcode tags
        setBarcodes([]);
        if (_getEl('product-edit-barcode')) _getEl('product-edit-barcode').value = '';
        
        if (_getEl('product-edit-category')) _getEl('product-edit-category').value = '';
        if (_getEl('product-edit-brand')) _getEl('product-edit-brand').value = '';
        if (_getEl('product-edit-supplier')) _getEl('product-edit-supplier').value = '';
        if (_getEl('product-edit-buy')) _getEl('product-edit-buy').value = '';
        if (_getEl('product-edit-sell')) _getEl('product-edit-sell').value = '';
        if (_getEl('product-edit-stock')) _getEl('product-edit-stock').value = '';
        if (_getEl('product-edit-low')) _getEl('product-edit-low').value = '';
        if (_getEl('product-edit-name')) delete _getEl('product-edit-name').dataset.productId;
        
        // Hide delete button for new products
        if (_getEl('btn-delete-product')) {
            _getEl('btn-delete-product').style.display = 'none';
        }
        
        // Re-enable stock input for new products
        if (_getEl('product-edit-stock')) {
            _getEl('product-edit-stock').disabled = false;
            _getEl('product-edit-stock').style.backgroundColor = '';
            _getEl('product-edit-stock').style.cursor = '';
        }
        
        // Hide stock adjustment and updates cards
        if (_getEl('stock-adjustment-card')) _getEl('stock-adjustment-card').style.display = 'none';
        if (_getEl('stock-updates-card')) _getEl('stock-updates-card').style.display = 'none';
        
        // Clear stock adjustment form
        if (_getEl('stock-adjustment-qty')) _getEl('stock-adjustment-qty').value = '';
        if (_getEl('stock-adjustment-note')) _getEl('stock-adjustment-note').value = '';
    }

    function saveProductFromForm() {
        const els = _getEls();
        const db = _getDb();
        const name = (_getEl('product-edit-name') && _getEl('product-edit-name').value || '').trim();
        const sku = (_getEl('product-edit-sku') && _getEl('product-edit-sku').value || '').trim();
        
        // Get barcodes from tag input (comma-separated string)
        const barcodeList = getBarcodes();
        const barcode = barcodeList.join(',');
        
        const category = (_getEl('product-edit-category') && _getEl('product-edit-category').value || '').trim();
        const brand = (_getEl('product-edit-brand') && _getEl('product-edit-brand').value || '').trim();
        const supplier = (_getEl('product-edit-supplier') && _getEl('product-edit-supplier').value || '').trim();
        const buy = (UTILS && typeof UTILS.parseMoneyInput === 'function') ? UTILS.parseMoneyInput(_getEl('product-edit-buy') && _getEl('product-edit-buy').value) : parseFloat(_getEl('product-edit-buy') && _getEl('product-edit-buy').value || '0');
        const sell = (UTILS && typeof UTILS.parseMoneyInput === 'function') ? UTILS.parseMoneyInput(_getEl('product-edit-sell') && _getEl('product-edit-sell').value) : parseFloat(_getEl('product-edit-sell') && _getEl('product-edit-sell').value || '0');
        const stock = parseInt(_getEl('product-edit-stock') && _getEl('product-edit-stock').value || '0', 10);
        const low = parseInt(_getEl('product-edit-low') && _getEl('product-edit-low').value || '0', 10);

        // Name is required, SKU is now optional
        if (!name) { return _showToast('Product', 'Product name is required.', 'error'); }
        if (sell < buy) { _showToast('Warning', 'Selling price is below buying price.', 'error'); }

        const existingId = _getEl('product-edit-name') && _getEl('product-edit-name').dataset.productId;
        let product;
        if (existingId) product = db.products.find(p => p.id === existingId);

        // Check SKU duplication only if SKU is provided
        if (sku) {
            const dup = db.products.find(p => p.sku === sku && p.id !== existingId);
            if (dup) return _showToast('Product', 'Another product already uses this SKU.', 'error');
        }
        
        // Check barcode duplication for each barcode
        if (barcodeList.length > 0) {
            for (const bc of barcodeList) {
                const barcodeDup = db.products.find(p => {
                    if (p.id === existingId) return false;
                    const existingBarcodes = (p.barcode || '').split(',').map(b => b.trim());
                    return existingBarcodes.includes(bc);
                });
                if (barcodeDup) {
                    return _showToast('Product', `Barcode "${bc}" is already used by another product.`, 'error');
                }
            }
        }

        if (product) {
            product.name = name; 
            product.sku = sku; 
            product.barcode = barcode; 
            product.category = category; 
            product.brand = brand; 
            product.supplier = supplier; 
            product.buyPrice = buy; 
            product.sellPrice = sell; 
            product.stock = stock; 
            product.lowStockAt = low;
        } else {
            // Generate unique ID
            const nextId = db.products.length > 0 ? Math.max(...db.products.map(p => parseInt(p.id.replace('p', '')) || 0)) + 1 : 1;
            product = { 
                id: 'p' + nextId, 
                name, 
                sku, 
                barcode, 
                category, 
                brand, 
                supplier, 
                buyPrice: buy, 
                sellPrice: sell, 
                stock, 
                lowStockAt: low, 
                createdAt: new Date().toISOString() 
            };
            db.products.push(product);
        }

        if (API && typeof API.saveDb === 'function') API.saveDb(); else if (typeof window.saveDb === 'function') window.saveDb();
        renderProductsTable();
        if (typeof window.renderProductSearchTable === 'function') window.renderProductSearchTable();
        if (typeof window.clearProductForm === 'function') window.clearProductForm(); else clearProductForm();
        _showToast('Product saved', `${product.name}`, 'success');
    }

    function focusProductSearch() {
        const els = _getEls();
        if (_getEl('product-search')) { _getEl('product-search').focus(); _getEl('product-search').select(); }
    }

    // Close overlay when clicking outside (if overlay exists and toggle not set)
    document.addEventListener('click', (ev) => {
        const els = _getEls();
        const overlay = _getById('product-overlay');
        const search = _getEl('product-search');
        if (!overlay) return;
        const toggle = _getEl('toggle-all-products');
        // if showing all products via checkbox or button, don't auto-close
        if (toggle) {
            if (toggle.tagName === 'INPUT' && toggle.checked) return;
            if (toggle.tagName !== 'INPUT' && (toggle.getAttribute('aria-pressed') === 'true' || toggle.classList.contains('active'))) return;
        }
        const target = ev.target;
        if (overlay.classList.contains('hidden')) return;
        if (overlay.contains(target)) return;
        if (search && (search.contains(target) || search === target)) return;
        overlay.classList.add('hidden');
    });

    // Expose API
    window.LitePos.products = {
        renderProductsTable,
        renderProductSearchTable,
        loadProductToForm,
        clearProductForm,
        saveProductFromForm,
        focusProductSearch,
        updateCategorySuggestions,
        updateBrandSuggestions,
        updateSupplierSuggestions,
        initBarcodeTagInput,
        addBarcodeTag,
        removeBarcodeTag,
        getBarcodes,
        setBarcodes
    };

    // ===== Barcode Tag Input =====
    let barcodes = [];

    function initBarcodeTagInput() {
        const container = _getById('barcode-tag-container');
        const input = _getEl('product-edit-barcode');
        if (!container || !input) return;

        // Click on container focuses the input
        container.addEventListener('click', (e) => {
            if (e.target === container) {
                input.focus();
            }
        });

        // Handle input events
        input.addEventListener('keydown', (e) => {
            const value = input.value.trim();
            
            // Space, Comma, or Enter adds the barcode
            if (e.key === ' ' || e.key === ',' || e.key === 'Enter') {
                e.preventDefault();
                if (value) {
                    addBarcodeTag(value);
                    input.value = '';
                }
            }
            
            // Backspace on empty input removes last tag
            else if (e.key === 'Backspace' && !input.value) {
                e.preventDefault();
                if (barcodes.length > 0) {
                    removeBarcodeTag(barcodes.length - 1);
                }
            }
        });

        // Also handle blur to add pending barcode
        input.addEventListener('blur', () => {
            const value = input.value.trim();
            if (value) {
                addBarcodeTag(value);
                input.value = '';
            }
        });
    }

    function addBarcodeTag(barcode) {
        barcode = barcode.trim();
        if (!barcode) return;
        
        // Check for duplicates
        if (barcodes.includes(barcode)) {
            _showToast('Duplicate', 'This barcode is already added.', 'warning');
            return;
        }

        barcodes.push(barcode);
        renderBarcodeTags();
        updateBarcodeHiddenField();
    }

    function removeBarcodeTag(index) {
        if (index >= 0 && index < barcodes.length) {
            barcodes.splice(index, 1);
            renderBarcodeTags();
            updateBarcodeHiddenField();
        }
    }

    function renderBarcodeTags() {
        const container = _getById('barcode-tag-container');
        const input = _getEl('product-edit-barcode');
        if (!container || !input) return;

        // Remove all existing tags
        const existingTags = container.querySelectorAll('.barcode-tag');
        existingTags.forEach(tag => tag.remove());

        // Add tags before the input
        barcodes.forEach((barcode, index) => {
            const tag = document.createElement('div');
            tag.className = 'barcode-tag';
            
            const text = document.createElement('span');
            text.className = 'barcode-tag-text';
            text.textContent = barcode;
            text.title = barcode; // Show full barcode on hover
            
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'barcode-tag-remove';
            removeBtn.innerHTML = '<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\" stroke=\"currentColor\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M6 18L18 6M6 6l12 12\"/></svg>';
            removeBtn.title = 'Remove barcode';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeBarcodeTag(index);
            });
            
            tag.appendChild(text);
            tag.appendChild(removeBtn);
            container.insertBefore(tag, input);
        });
    }

    function updateBarcodeHiddenField() {
        const hidden = _getEl('product-edit-barcode-hidden');
        if (hidden) {
            hidden.value = barcodes.join(',');
        }
    }

    function getBarcodes() {
        return barcodes.slice(); // Return copy
    }

    function setBarcodes(barcodeArray) {
        barcodes = Array.isArray(barcodeArray) ? barcodeArray.filter(b => b.trim()) : [];
        renderBarcodeTags();
        updateBarcodeHiddenField();
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBarcodeTagInput);
    } else {
        initBarcodeTagInput();
    }

})();

