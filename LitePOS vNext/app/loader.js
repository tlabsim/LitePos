// app/loader.js - No external loading, everything inline
(function() {
    'use strict';
    
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    
    // No component loading needed - everything is inline in HTML
    ns.initializeApp = function() {
        console.log('[Loader] Initializing LitePos...');
        
        // Initialize the app
        if (typeof window.init === 'function') {
            window.init();
        }
        
        console.log('[Loader] LitePos ready');
    };
    
    // Tab switching
    ns.switchTab = function(tabName) {
        // Hide all views
        const views = document.querySelectorAll('.tab-view');
        views.forEach(view => view.classList.remove('active'));
        
        // Show selected view
        const targetView = document.getElementById(`view-${tabName}`);
        if (targetView) {
            targetView.classList.add('active');
        }
        
        // Update sidebar active state
        const navItems = document.querySelectorAll('.sidebar-nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        
        const activeItem = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
        
        // Store current tab
        localStorage.setItem('litepos_current_tab', tabName);
        
        // Trigger tab-specific initialization
        if (ns.onTabSwitch && typeof ns.onTabSwitch === 'function') {
            ns.onTabSwitch(tabName);
        }
    };
    
    // Theme toggle
    ns.toggleTheme = function() {
        const body = document.body;
        const currentTheme = body.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        body.setAttribute('data-theme', newTheme);
        localStorage.setItem('litepos_theme', newTheme);
        
        console.log(`[Theme] Switched to ${newTheme} mode`);
    };
    
    // Apply saved theme on load
    ns.applySavedTheme = function() {
        const savedTheme = localStorage.getItem('litepos_theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
    };
    
    // Restore last active tab
    ns.restoreLastTab = function() {
        const lastTab = localStorage.getItem('litepos_current_tab') || 'sale';
        ns.switchTab(lastTab);
    };
    
})();
