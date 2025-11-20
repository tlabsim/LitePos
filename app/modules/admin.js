// app/modules/admin.js
(function () {
    'use strict';

    window.LitePos = window.LitePos || {};
    window.LitePos.admin = window.LitePos.admin || {};

    const KEY = 'litepos_bdt_db_v1';

    function getState() {
        window.LitePos.state = window.LitePos.state || {};
        return window.LitePos.state;
    }

    function getEls() {
        return window.LitePos.elements || {};
    }

    function saveDb(nextDb) {
        if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveDb === 'function') {
            try { window.LitePos.api.saveDb(nextDb); return; } catch (e) { console.error(e); }
        }
        try {
            localStorage.setItem(KEY, JSON.stringify(nextDb));
            window.LitePos.state = window.LitePos.state || {};
            window.LitePos.state.db = nextDb;
        } catch (e) { console.error('admin.saveDb failed', e); }
    }

    function showToast(title, msg, type) {
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.showToast === 'function') {
            try { return window.LitePos.ui.showToast(title, msg, type); } catch (e) { console.error(e); }
        }
        if (typeof window.showToast === 'function') return window.showToast(title, msg, type);
        console.log(title, msg, type);
    }

    function loadShopForm() {
        const state = getState();
        const els = getEls();
        const db = state.db || {};
        if (!els['shop-name']) return;
        els['shop-name'].value = (db.shop && db.shop.name) || '';
        els['shop-address'].value = (db.shop && db.shop.address) || '';
        els['shop-phone'].value = (db.shop && db.shop.phone) || '';
    }

    function saveShopSettingsFromForm() {
        const state = getState();
        const els = getEls();
        const db = state.db || {};
        db.shop = db.shop || {};
        db.shop.name = (els['shop-name'] && els['shop-name'].value.trim()) || 'Shop';
        db.shop.address = (els['shop-address'] && els['shop-address'].value.trim()) || '';
        db.shop.phone = (els['shop-phone'] && els['shop-phone'].value.trim()) || '';
        saveDb(db);
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.loadShopIntoHeader === 'function') {
            try { window.LitePos.ui.loadShopIntoHeader(); } catch (e) { console.error(e); }
        }
        showToast('Settings saved', 'Shop settings updated.', 'success');
    }

    function renderUsersTable() {
        const state = getState();
        const els = getEls();
        const db = state.db || { users: [] };
        const tbody = els['users-table-body'];
        if (!tbody) return;
        tbody.innerHTML = '';
        (db.users || []).forEach(u => {
            const tr = document.createElement('tr');
            tr.addEventListener('click', () => loadUserToForm(u.id));

            const tdName = document.createElement('td'); tdName.textContent = u.name; tr.appendChild(tdName);
            const tdUsername = document.createElement('td'); tdUsername.textContent = u.username; tr.appendChild(tdUsername);
            const tdRole = document.createElement('td'); tdRole.textContent = u.role === 'superadmin' ? 'Superadmin' : 'Sales'; tr.appendChild(tdRole);

            tbody.appendChild(tr);
        });
    }

    function loadUserToForm(id) {
        const state = getState();
        const els = getEls();
        const db = state.db || {};
        const u = (db.users || []).find(x => x.id === id);
        if (!u) return;
        els['user-edit-name'].value = u.name;
        els['user-edit-username'].value = u.username;
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = u.role;
        els['user-edit-name'].dataset.userId = u.id;
    }

    function clearUserForm() {
        const els = getEls();
        els['user-edit-name'].value = '';
        els['user-edit-username'].value = '';
        els['user-edit-pin'].value = '';
        els['user-edit-role'].value = 'sales';
        delete els['user-edit-name'].dataset.userId;
    }

    function saveUserFromForm() {
        const state = getState();
        const els = getEls();
        const db = state.db || { users: [] };
        const name = (els['user-edit-name'].value || '').trim();
        const username = (els['user-edit-username'].value || '').trim();
        const pin = (els['user-edit-pin'].value || '').trim();
        const role = els['user-edit-role'].value;
        if (!name || !username) return showToast('User', 'Name & username are required.', 'error');

        const existingId = els['user-edit-name'].dataset.userId;
        let user = existingId ? (db.users || []).find(u => u.id === existingId) : null;

        const dup = (db.users || []).find(u => u.username === username && u.id !== existingId);
        if (dup) return showToast('User', 'Another user already uses this username.', 'error');

        if (user) {
            const wasSuper = user.role === 'superadmin';
            user.name = name;
            user.username = username;
            if (pin) {
                if (!/^\d{4,6}$/.test(pin)) return showToast('User', 'PIN must be 4–6 digits if provided.', 'error');
                user.pin = pin;
            }
            user.role = role;
            if (wasSuper && role !== 'superadmin') {
                const remainingSuper = (db.users || []).filter(u => u.role === 'superadmin').length;
                if (remainingSuper === 0) {
                    user.role = 'superadmin';
                    return showToast('User', 'At least one Superadmin is required.', 'error');
                }
            }
        } else {
            if (!/^\d{4,6}$/.test(pin || '')) return showToast('User', 'PIN must be 4–6 digits.', 'error');
            user = { id: 'u' + ((db.users || []).length + 1), name, username, pin, role, createdAt: new Date().toISOString() };
            db.users = db.users || [];
            db.users.push(user);
        }

        saveDb(db);
        renderUsersTable();
        if (window.LitePos && window.LitePos.sales && typeof window.LitePos.sales.populateSalespersonFilter === 'function') {
            try { window.LitePos.sales.populateSalespersonFilter(); } catch (e) { console.error(e); }
        }
        showToast('User saved', `${user.name}`, 'success');
    }

    function downloadBackup() {
        const state = getState();
        const db = state.db || {};
        const backup = { exportedAt: new Date().toISOString(), db };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const todayStr = (new Date()).toISOString().slice(0,10).replace(/-/g,'');
        a.href = url;
        a.download = `litepos-backup-${todayStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Backup', 'Backup JSON downloaded.', 'success');
    }

    function handleRestoreFile(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!confirm('Restoring backup will replace all local data. Continue?')) { ev.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                const nextDb = parsed.db || parsed;
                if (!nextDb || !nextDb.shop || !nextDb.users) throw new Error('Invalid backup structure.');
                localStorage.setItem(KEY, JSON.stringify(nextDb));
                if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveDb === 'function') {
                    try { window.LitePos.api.saveDb(nextDb); } catch (e) { /* ignore */ }
                }
                if (window.LitePos && window.LitePos.api && typeof window.LitePos.api.saveSession === 'function') {
                    try { window.LitePos.api.saveSession(null); } catch (e) { /* ignore */ }
                } else {
                    localStorage.removeItem('litepos_bdt_session_v1');
                }
                showToast('Restore', 'Backup restored. Reloading...', 'success');
                setTimeout(() => location.reload(), 700);
            } catch (e) {
                console.error(e);
                showToast('Restore failed', 'Invalid backup file.', 'error');
            }
        };
        reader.readAsText(file);
        ev.target.value = '';
    }

    // Expose
    window.LitePos.admin.loadShopForm = loadShopForm;
    window.LitePos.admin.saveShopSettingsFromForm = saveShopSettingsFromForm;
    window.LitePos.admin.renderUsersTable = renderUsersTable;
    window.LitePos.admin.loadUserToForm = loadUserToForm;
    window.LitePos.admin.clearUserForm = clearUserForm;
    window.LitePos.admin.saveUserFromForm = saveUserFromForm;
    window.LitePos.admin.downloadBackup = downloadBackup;
    window.LitePos.admin.handleRestoreFile = handleRestoreFile;

})();
