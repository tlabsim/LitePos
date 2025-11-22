// app.js - lightweight loader that injects app/core.js
(function () {
    'use strict';

    // Sequential loader: load module scripts in order, then load app/core.js as fallback/main.
    const scriptList = [
        'app/modules/utils.js',
        'app/modules/db.js',
        'app/modules/session.js',
        'app/modules/ui.js',
        'app/modules/pos.js',
        'app/modules/customers.js',
        'app/modules/products.js',
        'app/modules/sales.js',
        'app/modules/reports.js',
        'app/modules/admin.js',
        // future modules can be added here
        'app/core.js'
    ];

    function loadScriptsSequentially(list, idx) {
        idx = typeof idx === 'number' ? idx : 0;
        if (idx >= list.length) return;
        const src = list[idx];
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.defer = false;
        s.onload = function () {
            loadScriptsSequentially(list, idx + 1);
        };
        s.onerror = function (e) {
            console.error('Failed to load script:', src, e);
            // continue to next to avoid complete stall
            loadScriptsSequentially(list, idx + 1);
        };
        document.body.appendChild(s);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { loadScriptsSequentially(scriptList); });
    } else {
        loadScriptsSequentially(scriptList);
    }
})();