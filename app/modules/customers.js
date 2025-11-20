/* Customers module for LitePos
   Provides customer-related UI and DB helpers and exposes them on window.LitePos.customers
*/
(function () {
    'use strict';

    window.LitePos = window.LitePos || {};
    const API = window.LitePos.api || {};
    const UTILS = window.LitePos.utils || {};
    const UI = window.LitePos.ui || {};
    window.LitePos.state = window.LitePos.state || {};
    const state = window.LitePos.state;

    function _getDb() {
        return state.db || (window.db || {});
    }

    function _getEls() {
        return window.LitePos.elements || {};
    }

    function _showToast(title, msg, type) {
        if (UI && typeof UI.showToast === 'function') return UI.showToast(title, msg, type);
        if (typeof window.showToast === 'function') return window.showToast(title, msg, type);
        console[type === 'error' ? 'error' : 'log'](title + ': ' + (msg || ''));
    }

    function renderCustomersTable() {
        console.log('[customers.js renderCustomersTable] Called');
        const els = _getEls();
        console.log('[customers.js] els keys:', Object.keys(els).length);
        console.log('[customers.js] customers-table-body:', els['customers-table-body']);
        const db = _getDb();
        console.log('[customers.js] db.customers length:', db.customers?.length);
        const tbody = els['customers-table-body'];
        if (!tbody) {
            console.error('[customers.js] tbody NOT FOUND!');
            return;
        }
        tbody.innerHTML = '';
        const query = (els['customer-search'] && els['customer-search'].value || '').trim().toLowerCase();
        const customers = db.customers || [];
        console.log('[customers.js] Starting forEach, customers count:', customers.length);

        customers
            .slice()
            .sort((a, b) => (b.lastSaleAt || '').localeCompare(a.lastSaleAt || ''))
            .forEach((c, idx) => {
                console.log('[customers.js] Processing customer', idx, c.name);
                if (query) {
                    const text = (c.name + ' ' + c.phone + ' ' + (c.address || '') + ' ' + (c.notes || '')).toLowerCase();
                    if (!text.includes(query)) return;
                }

                const tr = document.createElement('tr');
                tr.addEventListener('click', (e) => {
                    // Don't load form if clicking delete button
                    if (e.target.closest('.btn-delete-customer')) return;
                    loadCustomerToForm(c.id);
                });

                const tdName = document.createElement('td');
                tdName.textContent = c.name;
                tr.appendChild(tdName);

                const tdPhone = document.createElement('td');
                tdPhone.textContent = c.phone || '—';
                tdPhone.style.textAlign = 'center';
                tr.appendChild(tdPhone);

                const tdAddress = document.createElement('td');
                tdAddress.textContent = c.address || '—';
                tr.appendChild(tdAddress);

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

                const tdActions = document.createElement('td');
                tdActions.style.textAlign = 'center';
                const btnDelete = document.createElement('button');
                btnDelete.className = 'btn btn-sm btn-ghost btn-delete-customer';
                btnDelete.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 16px; height: 16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
                btnDelete.title = 'Delete customer';
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteCustomer(c.id);
                });
                tdActions.appendChild(btnDelete);
                tr.appendChild(tdActions);

                tbody.appendChild(tr);
                console.log('[customers.js] Appended row for customer', c.name);
            });
        console.log('[customers.js] Finished rendering, tbody.children.length:', tbody.children.length);
    }

    function loadCustomerToForm(id) {
        const els = _getEls();
        const db = _getDb();
        const c = db.customers.find(cu => cu.id === id);
        if (!c) return;
        if (els['customer-edit-name']) els['customer-edit-name'].value = c.name;
        if (els['customer-edit-phone']) els['customer-edit-phone'].value = c.phone;
        if (els['customer-edit-address']) els['customer-edit-address'].value = c.address || '';
        if (els['customer-edit-notes']) els['customer-edit-notes'].value = c.notes || '';
        if (els['customer-edit-name']) els['customer-edit-name'].dataset.customerId = c.id;
    }

    function clearCustomerForm() {
        const els = _getEls();
        if (els['customer-edit-name']) els['customer-edit-name'].value = '';
        if (els['customer-edit-phone']) els['customer-edit-phone'].value = '';
        if (els['customer-edit-address']) els['customer-edit-address'].value = '';
        if (els['customer-edit-notes']) els['customer-edit-notes'].value = '';
        if (els['customer-edit-name']) delete els['customer-edit-name'].dataset.customerId;
    }

    function saveCustomerFromForm() {
        const els = _getEls();
        const db = _getDb();
        const name = (els['customer-edit-name'] && els['customer-edit-name'].value || '').trim();
        const phone = (els['customer-edit-phone'] && els['customer-edit-phone'].value || '').trim();
        const address = (els['customer-edit-address'] && els['customer-edit-address'].value || '').trim();
        const notes = (els['customer-edit-notes'] && els['customer-edit-notes'].value || '').trim();
        if (!name) return _showToast('Customer', 'Name is required.', 'error');

        const existingId = els['customer-edit-name'] && els['customer-edit-name'].dataset.customerId;
        let customer;
        if (existingId) {
            customer = db.customers.find(c => c.id === existingId);
        }

        if (phone) {
            const dup = db.customers.find(c => c.phone === phone && c.id !== existingId);
            if (dup) return _showToast('Customer', 'Another customer already uses this phone.', 'error');
        }

        if (customer) {
            customer.name = name;
            customer.phone = phone;
            customer.address = address;
            customer.notes = notes;
        } else {
            customer = {
                id: 'c' + (db.customers.length + 1),
                name,
                phone,
                address,
                notes,
                lastSaleAt: null,
                lastSaleTotal: 0
            };
            db.customers.push(customer);
        }
        if (API && typeof API.saveDb === 'function') API.saveDb();
        else if (typeof window.saveDb === 'function') window.saveDb();
        renderCustomersTable();
        _showToast('Customer saved', `${customer.name}`, 'success');
    }

    function findCustomerFromInput() {
        const els = _getEls();
        const db = _getDb();
        const phone = (els['sale-customer-phone'] && els['sale-customer-phone'].value || '').trim();
        if (!phone) {
            if (typeof setCurrentCustomer === 'function') return setCurrentCustomer(null);
            return _showToast('Customer search', 'Please enter phone number.', 'error');
        }
        const customer = db.customers.find(c => c.phone === phone);
        if (customer) {
            if (typeof setCurrentCustomer === 'function') setCurrentCustomer(customer);
            if (els['sale-customer-name']) els['sale-customer-name'].value = customer.name;
            _showToast('Customer found', customer.name, 'success');
        } else {
            if (typeof setCurrentCustomer === 'function') setCurrentCustomer({ id: null, name: '', phone, notes: '', lastSaleAt: null, lastSaleTotal: 0 });
            if (els['sale-customer-name']) els['sale-customer-name'].value = '';
            _showToast('New customer', 'Not found, you can quick-add.', 'success');
        }
    }

    function setCurrentCustomer(customer) {
        // Sync with window.LitePos.state and core's currentSale
        const els = _getEls();
        
        // Ensure state exists and is synced
        if (!window.LitePos.state.currentSale) {
            window.LitePos.state.currentSale = window.createEmptySale ? window.createEmptySale() : { items: [], customer: null };
        }
        
        // Update state
        window.LitePos.state.currentSale.customer = customer || null;
        
        // Also sync to core if it exists
        if (typeof window.currentSale !== 'undefined') {
            if (!window.currentSale) {
                window.currentSale = window.createEmptySale ? window.createEmptySale() : { items: [], customer: null };
            }
            window.currentSale.customer = customer || null;
        }

        // Update UI - badge and fields
        if (!customer) {
            const badge = els['summary-customer-badge'] || document.getElementById('summary-customer-badge');
            if (badge) badge.textContent = 'Walk-in';
            if (els['sale-customer-phone']) els['sale-customer-phone'].value = '';
            if (els['sale-customer-name']) els['sale-customer-name'].value = '';
        } else {
            // CRITICAL: Check customer.id to determine if returning or new
            const badge = els['summary-customer-badge'] || document.getElementById('summary-customer-badge');
            if (badge) {
                badge.textContent = customer.id ? 'Returning' : 'Walk-in';
            }
            if (els['sale-customer-phone']) els['sale-customer-phone'].value = customer.phone || '';
            if (els['sale-customer-name']) els['sale-customer-name'].value = customer.name || '';
        }
        
        // Trigger auto-save after updating customer
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.autoSaveCurrentSale === 'function') {
            window.LitePos.pos.autoSaveCurrentSale();
        }
    }

    function saveQuickCustomer() {
        const els = _getEls();
        const db = _getDb();
        const phone = (els['sale-customer-phone'] && els['sale-customer-phone'].value || '').trim();
        if (!phone) return _showToast('Quick add', 'Enter phone number first.', 'error');
        const name = (els['quick-customer-name'] && els['quick-customer-name'].value || '').trim() || (els['sale-customer-name'] && els['sale-customer-name'].value || '').trim() || 'Customer';
        const notes = (els['quick-customer-notes'] && els['quick-customer-notes'].value || '').trim();

        let existing = db.customers.find(c => c.phone === phone);
        if (existing) {
            existing.name = name;
            existing.notes = notes;
        } else {
            existing = { id: 'c' + (db.customers.length + 1), name, phone, notes, lastSaleAt: null, lastSaleTotal: 0 };
            db.customers.push(existing);
        }
        if (API && typeof API.saveDb === 'function') API.saveDb();
        else if (typeof window.saveDb === 'function') window.saveDb();
        if (typeof setCurrentCustomer === 'function') setCurrentCustomer(existing);
        if (els['quick-customer-name']) els['quick-customer-name'].value = '';
        if (els['quick-customer-notes']) els['quick-customer-notes'].value = '';
        _showToast('Customer saved', `${existing.name} (${existing.phone || 'no phone'})`, 'success');
        renderCustomersTable();
    }

    function focusCustomerPhone() {
        const els = _getEls();
        if (els['sale-customer-phone']) { els['sale-customer-phone'].focus(); els['sale-customer-phone'].select(); }
    }

    function renderCustomerOverlay() {
        const els = _getEls();
        const db = _getDb();
        const overlayBody = els['customer-overlay-body'];
        const overlay = els['customer-overlay'];
        if (!overlayBody || !overlay) return;
        const q = (els['sale-customer-phone'] && els['sale-customer-phone'].value || '').trim().toLowerCase();
        overlayBody.innerHTML = '';
        if (q.length < 3) { overlay.classList.add('hidden'); return; }

        const customers = (db.customers || []).filter(c => {
            return (c.phone || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q);
        }).slice(0, 20);

        customers.forEach(c => {
            const tr = document.createElement('tr');
            tr.addEventListener('click', () => {
                // Populate input fields and trigger the search which calls setCurrentCustomer
                if (els['sale-customer-phone']) els['sale-customer-phone'].value = c.phone || '';
                if (els['sale-customer-name']) els['sale-customer-name'].value = c.name || '';
                // Call findCustomerFromInput from core which will delegate properly
                if (typeof window.findCustomerFromInput === 'function') {
                    window.findCustomerFromInput();
                } else {
                    // Fallback: call module's setCurrentCustomer directly
                    setCurrentCustomer(c);
                }
                overlay.classList.add('hidden');
            });

            const tdName = document.createElement('td'); tdName.textContent = c.name || ''; tr.appendChild(tdName);
            const tdPhone = document.createElement('td'); tdPhone.textContent = c.phone || ''; tr.appendChild(tdPhone);
            const tdBtn = document.createElement('td'); tdBtn.textContent = ''; tr.appendChild(tdBtn);
            overlayBody.appendChild(tr);
        });

        if (customers.length > 0) overlay.classList.remove('hidden'); else overlay.classList.add('hidden');
    }

    function deleteCustomer(id) {
        const db = _getDb();
        const customer = db.customers.find(c => c.id === id);
        if (!customer) return;
        
        // Confirm deletion
        const confirmed = confirm(`Delete customer "${customer.name}"?\n\nThis action cannot be undone.`);
        if (!confirmed) return;
        
        // Remove customer from array
        const idx = db.customers.findIndex(c => c.id === id);
        if (idx > -1) {
            db.customers.splice(idx, 1);
            if (API && typeof API.saveDb === 'function') API.saveDb();
            else if (typeof window.saveDb === 'function') window.saveDb();
            renderCustomersTable();
            _showToast('Customer deleted', `${customer.name} has been removed.`, 'success');
        }
    }

    function formatMoney(v) {
        if (UTILS && typeof UTILS.formatMoney === 'function') return UTILS.formatMoney(v);
        const n = Number(v || 0); return '৳ ' + n.toFixed(2);
    }

    // Expose API
    window.LitePos.customers = {
        renderCustomersTable,
        loadCustomerToForm,
        clearCustomerForm,
        saveCustomerFromForm,
        findCustomerFromInput,
        setCurrentCustomer,
        saveQuickCustomer,
        focusCustomerPhone,
        deleteCustomer
    };

    // Live customer search: show overlay while typing phone (>=3 chars)
    document.addEventListener('input', (ev) => {
        const els = _getEls();
        if (!els['sale-customer-phone']) return;
        if (ev.target !== els['sale-customer-phone']) return;
        renderCustomerOverlay();
    });

    // Close customer overlay on outside click
    document.addEventListener('click', (ev) => {
        const els = _getEls();
        const overlay = els['customer-overlay'];
        const input = els['sale-customer-phone'];
        if (!overlay) return;
        const target = ev.target;
        if (overlay.classList.contains('hidden')) return;
        if (overlay.contains(target)) return;
        if (input && (input.contains(target) || input === target)) return;
        overlay.classList.add('hidden');
    });

})();
