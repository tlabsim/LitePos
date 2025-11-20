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
            try { 
                window.LitePos.api.saveDb(nextDb);
                // Ensure state.db is also updated
                window.LitePos.state = window.LitePos.state || {};
                window.LitePos.state.db = nextDb;
                return; 
            } catch (e) { console.error(e); }
        }
        try {
            localStorage.setItem(KEY, JSON.stringify(nextDb));
            window.LitePos.state = window.LitePos.state || {};
            window.LitePos.state.db = nextDb;
            // Also update window.db for backward compatibility
            if (typeof window.db !== 'undefined') {
                window.db = nextDb;
            }
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
        
        // Load logo preview if exists
        const logoPreview = els['shop-logo-preview'];
        const logoImg = els['shop-logo-preview-img'];
        if (db.shop && db.shop.logo && logoPreview && logoImg) {
            logoImg.src = db.shop.logo;
            logoPreview.style.display = 'block';
        } else if (logoPreview) {
            logoPreview.style.display = 'none';
        }
    }

    function saveShopSettingsFromForm() {
        const state = getState();
        const els = getEls();
        const db = state.db || {};
        db.shop = db.shop || {};
        db.shop.name = (els['shop-name'] && els['shop-name'].value.trim()) || 'Shop';
        db.shop.address = (els['shop-address'] && els['shop-address'].value.trim()) || '';
        db.shop.phone = (els['shop-phone'] && els['shop-phone'].value.trim()) || '';
        // Logo is saved separately via handleLogoUpload, preserve existing logo
        saveDb(db);
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.loadShopIntoHeader === 'function') {
            try { window.LitePos.ui.loadShopIntoHeader(); } catch (e) { console.error(e); }
        }
        showToast('Settings saved', 'Shop settings updated.', 'success');
    }

    function handleLogoUpload(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        
        // Validate file type
        if (!file.type.match(/^image\//)) {
            showToast('Logo Error', 'Please select an image file.', 'error');
            ev.target.value = '';
            return;
        }
        
        // Validate file size (200KB = 204800 bytes)
        if (file.size > 204800) {
            showToast('Logo Error', 'Image must be under 200KB. Please resize and try again.', 'error');
            ev.target.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result;
            const state = getState();
            const db = state.db || {};
            db.shop = db.shop || {};
            db.shop.logo = base64;
            saveDb(db);
            
            // Update preview
            const els = getEls();
            const logoPreview = els['shop-logo-preview'];
            const logoImg = els['shop-logo-preview-img'];
            if (logoPreview && logoImg) {
                logoImg.src = base64;
                logoPreview.style.display = 'block';
            }
            
            // Update header logo
            if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.loadShopIntoHeader === 'function') {
                try { window.LitePos.ui.loadShopIntoHeader(); } catch (e) { console.error(e); }
            }
            
            showToast('Logo uploaded', 'Shop logo saved successfully.', 'success');
        };
        reader.onerror = () => {
            showToast('Logo Error', 'Failed to read image file.', 'error');
            ev.target.value = '';
        };
        reader.readAsDataURL(file);
    }

    function removeLogo() {
        const state = getState();
        const db = state.db || {};
        db.shop = db.shop || {};
        delete db.shop.logo;
        saveDb(db);
        
        // Clear preview
        const els = getEls();
        const logoPreview = els['shop-logo-preview'];
        const logoInput = els['shop-logo-input'];
        if (logoPreview) logoPreview.style.display = 'none';
        if (logoInput) logoInput.value = '';
        
        // Update header
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.loadShopIntoHeader === 'function') {
            try { window.LitePos.ui.loadShopIntoHeader(); } catch (e) { console.error(e); }
        }
        
        showToast('Logo removed', 'Shop logo has been removed.', 'success');
    }

    function loadGlobalSettings() {
        const state = getState();
        
        // Ensure state.db exists
        if (!state.db) {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                try {
                    state.db = JSON.parse(raw);
                } catch (e) {
                    console.error('Failed to parse db from localStorage', e);
                }
            }
        }
        
        const db = state.db || {};
        const settings = db.settings || {};
        
        // Get elements directly
        const currencyInput = document.getElementById('global-currency-symbol');
        const timezoneInput = document.getElementById('global-timezone');
        const printSizeInput = document.getElementById('global-print-size');
        const printTemplateInput = document.getElementById('global-print-template');
        
        if (currencyInput) {
            currencyInput.value = settings.currency || '৳';
        }
        if (timezoneInput) {
            timezoneInput.value = String(settings.timezone !== undefined ? settings.timezone : 0);
        }
        if (printSizeInput) {
            printSizeInput.value = settings.defaultPrintSize || 'a4';
        }
        if (printTemplateInput) {
            printTemplateInput.value = settings.defaultPrintTemplate || 'standard';
        }
    }

    function saveGlobalSettings() {
        console.log('[admin.js] saveGlobalSettings called');
        const state = getState();
        
        console.log('[admin.js] state:', state);
        
        // Ensure state.db exists and is initialized
        if (!state.db) {
            // Load from localStorage if not in state
            const raw = localStorage.getItem(KEY);
            if (raw) {
                try {
                    state.db = JSON.parse(raw);
                    console.log('[admin.js] Loaded db from localStorage');
                } catch (e) {
                    console.error('Failed to parse db from localStorage', e);
                    state.db = {};
                }
            } else {
                state.db = {};
                console.log('[admin.js] Created new empty db');
            }
        }
        
        const db = state.db;
        db.settings = db.settings || {};
        
        // Get elements directly, not from cache
        const currencyInput = document.getElementById('global-currency-symbol');
        const timezoneInput = document.getElementById('global-timezone');
        const printSizeInput = document.getElementById('global-print-size');
        const printTemplateInput = document.getElementById('global-print-template');
        
        console.log('[admin.js] Currency input:', currencyInput, 'value:', currencyInput?.value);
        console.log('[admin.js] Timezone input:', timezoneInput, 'value:', timezoneInput?.value);
        console.log('[admin.js] Print size input:', printSizeInput, 'value:', printSizeInput?.value);
        console.log('[admin.js] Print template input:', printTemplateInput, 'value:', printTemplateInput?.value);
        
        db.settings.currency = (currencyInput && currencyInput.value.trim()) || '৳';
        db.settings.timezone = (timezoneInput && parseFloat(timezoneInput.value)) || 0;
        db.settings.defaultPrintSize = (printSizeInput && printSizeInput.value) || 'a4';
        db.settings.defaultPrintTemplate = (printTemplateInput && printTemplateInput.value) || 'standard';
        
        console.log('[admin.js] Saving settings:', db.settings);
        
        // Save to localStorage and state
        saveDb(db);
        state.db = db;
        window.LitePos.state.db = db;
        
        console.log('[admin.js] After save - localStorage:', localStorage.getItem(KEY));
        console.log('[admin.js] After save - state.db.settings:', state.db.settings);
        
        // Update header with new currency symbol
        if (window.LitePos && window.LitePos.ui && typeof window.LitePos.ui.loadShopIntoHeader === 'function') {
            try { window.LitePos.ui.loadShopIntoHeader(); } catch (e) { console.error(e); }
        }
        
        // Refresh all money displays with new currency
        if (window.LitePos && window.LitePos.pos && typeof window.LitePos.pos.updateSaleTotals === 'function') {
            try { window.LitePos.pos.updateSaleTotals(); } catch (e) { console.error(e); }
        }
        
        showToast('Settings saved', 'Global settings updated successfully.', 'success');
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

    // -------------------------
    // BACKUP ENCRYPTION UTILITIES
    // -------------------------
    
    /**
     * Derive encryption key from password using PBKDF2
     * @param {string} password - User password
     * @param {Uint8Array} salt - Random salt
     * @returns {Promise<CryptoKey>} Derived key
     */
    async function deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        const baseKey = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000, // OWASP recommendation
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
    
    /**
     * Encrypt data using AES-256-GCM
     * @param {string} plaintext - Data to encrypt
     * @param {string} password - Encryption password
     * @returns {Promise<string>} Base64 encoded encrypted data with salt and IV
     */
    async function encryptData(plaintext, password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(plaintext);
        
        // Generate random salt and IV
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        // Derive key from password
        const key = await deriveKey(password, salt);
        
        // Encrypt data
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
        );
        
        // Combine salt + iv + encrypted data
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);
        
        // Convert to base64
        return btoa(String.fromCharCode.apply(null, combined));
    }
    
    /**
     * Decrypt data using AES-256-GCM
     * @param {string} encryptedBase64 - Base64 encoded encrypted data
     * @param {string} password - Decryption password
     * @returns {Promise<string>} Decrypted plaintext
     */
    async function decryptData(encryptedBase64, password) {
        // Decode base64
        const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        
        // Extract salt, IV, and encrypted data
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encrypted = combined.slice(28);
        
        // Derive key from password
        const key = await deriveKey(password, salt);
        
        // Decrypt data
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );
        
        // Convert to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    async function downloadBackup(password) {
        const state = getState();
        const db = state.db || {};
        const backup = { exportedAt: new Date().toISOString(), db };
        
        let content;
        let filename;
        
        // Format: litepos-backup-YYYYMMDD-HHMMSS
        const now = new Date();
        const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
        const timeStr = now.toISOString().slice(11,19).replace(/:/g,'');
        
        if (password) {
            // Encrypt backup
            try {
                const plaintext = JSON.stringify(backup, null, 2);
                const encrypted = await encryptData(plaintext, password);
                
                // Create encrypted backup structure
                const encryptedBackup = {
                    encrypted: true,
                    version: '1.0.0',
                    data: encrypted
                };
                
                content = JSON.stringify(encryptedBackup, null, 2);
                filename = `litepos-backup-${dateStr}-${timeStr}-encrypted.json`;
                
                // Update last backup date
                db.settings = db.settings || {};
                db.settings.lastBackupDate = now.toISOString();
                saveDb(db);
                
                showToast('Encrypted Backup', 'Password-protected backup downloaded. Keep your password safe!', 'success');
            } catch (err) {
                console.error('Encryption failed:', err);
                showToast('Encryption Failed', 'Could not encrypt backup. ' + err.message, 'error');
                return;
            }
        } else {
            // Plain text backup
            content = JSON.stringify(backup, null, 2);
            filename = `litepos-backup-${dateStr}-${timeStr}.json`;
            
            // Update last backup date
            db.settings = db.settings || {};
            db.settings.lastBackupDate = now.toISOString();
            saveDb(db);
            
            showToast('Backup', 'Backup JSON downloaded.', 'success');
        }
        
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function handleRestoreFile(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!confirm('Restoring backup will replace all local data. Continue?')) { ev.target.value = ''; return; }
        
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(reader.result);
                let nextDb;
                
                // Check if backup is encrypted
                if (parsed.encrypted) {
                    const password = prompt('This backup is encrypted. Enter password:');
                    if (!password) {
                        showToast('Restore cancelled', 'Password required for encrypted backup.', 'error');
                        ev.target.value = '';
                        return;
                    }
                    
                    try {
                        const decrypted = await decryptData(parsed.data, password);
                        const decryptedBackup = JSON.parse(decrypted);
                        nextDb = decryptedBackup.db || decryptedBackup;
                    } catch (err) {
                        console.error('Decryption failed:', err);
                        showToast('Restore failed', 'Incorrect password or corrupted backup.', 'error');
                        ev.target.value = '';
                        return;
                    }
                } else {
                    // Plain text backup
                    nextDb = parsed.db || parsed;
                }
                
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
    window.LitePos.admin.handleLogoUpload = handleLogoUpload;
    window.LitePos.admin.removeLogo = removeLogo;
    window.LitePos.admin.loadGlobalSettings = loadGlobalSettings;
    window.LitePos.admin.saveGlobalSettings = saveGlobalSettings;
    window.LitePos.admin.renderUsersTable = renderUsersTable;
    window.LitePos.admin.loadUserToForm = loadUserToForm;
    window.LitePos.admin.clearUserForm = clearUserForm;
    window.LitePos.admin.saveUserFromForm = saveUserFromForm;
    window.LitePos.admin.downloadBackup = downloadBackup;
    window.LitePos.admin.handleRestoreFile = handleRestoreFile;

})();
