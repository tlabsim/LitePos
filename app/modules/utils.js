// app/modules/utils.js
(function () {
    window.LitePos = window.LitePos || {};
    const ns = window.LitePos;
    ns.utils = ns.utils || {};

    ns.utils.formatMoney = function (value) {
        const num = Number(value || 0);
        const currency = (ns.state?.db?.settings?.currency) || '৳';
        return currency + ' ' + num.toFixed(2);
    };

    ns.utils.shortMoney = function (value) {
        const num = Number(value || 0);
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toFixed(0);
    };

    ns.utils.parseMoneyInput = function (val) {
        const n = parseFloat(val || '0');
        return isNaN(n) ? 0 : n;
    };

    ns.utils.toDateInput = function (d) {
        const date = d instanceof Date ? d : new Date(d);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    ns.utils.structuredClone = function (obj) {
        return JSON.parse(JSON.stringify(obj));
    };

    // ===== Timezone Utilities =====
    
    /**
     * Get the configured timezone offset in hours from settings
     * @returns {number} Timezone offset in hours (e.g., 6 for UTC+6)
     */
    ns.utils.getTimezoneOffset = function () {
        const settings = ns.state?.db?.settings || {};
        return settings.timezone !== undefined ? settings.timezone : 0;
    };

    /**
     * Convert a UTC date/time to local time based on configured timezone
     * @param {Date|string} utcDate - UTC date object or ISO string
     * @returns {Date} Date object adjusted to configured timezone
     */
    ns.utils.utcToLocal = function (utcDate) {
        const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
        const offset = ns.utils.getTimezoneOffset();
        const localDate = new Date(date.getTime() + (offset * 60 * 60 * 1000));
        return localDate;
    };

    /**
     * Format time from UTC date in configured timezone
     * @param {Date|string} utcDate - UTC date to format
     * @param {object} options - Format options (hour12, etc.)
     * @returns {string} Formatted time string
     */
    ns.utils.formatTimeInTimezone = function (utcDate, options = {}) {
        const date = utcDate instanceof Date ? utcDate : new Date(utcDate);
        const offset = ns.utils.getTimezoneOffset();
        
        // Get UTC time and add timezone offset
        const localTime = date.getTime() + (offset * 60 * 60 * 1000);
        const localDate = new Date(localTime);
        
        // Extract hours and minutes from UTC (which now represents our local time)
        const hours24 = localDate.getUTCHours();
        const minutes = localDate.getUTCMinutes();
        
        const hour12 = options.hour12 !== false; // default to 12-hour format
        
        if (hour12) {
            const hours12 = hours24 % 12 || 12;
            const ampm = hours24 < 12 ? 'AM' : 'PM';
            const minutesStr = String(minutes).padStart(2, '0');
            return `${hours12}:${minutesStr} ${ampm}`;
        } else {
            const minutesStr = String(minutes).padStart(2, '0');
            return `${hours24}:${minutesStr}`;
        }
    };

    /**
     * Convert a local date/time to UTC based on configured timezone
     * @param {Date|string} localDate - Local date object or string
     * @returns {Date} UTC date object
     */
    ns.utils.localToUtc = function (localDate) {
        const date = localDate instanceof Date ? localDate : new Date(localDate);
        const offset = ns.utils.getTimezoneOffset();
        const utcDate = new Date(date.getTime() - (offset * 60 * 60 * 1000));
        return utcDate;
    };

    /**
     * Get current date/time in configured timezone
     * @returns {Date} Current date in local timezone
     */
    ns.utils.now = function () {
        return ns.utils.utcToLocal(new Date());
    };

    /**
     * Format a date for display in configured timezone
     * @param {Date|string} date - Date to format
     * @param {object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date string
     */
    ns.utils.formatDate = function (date, options = {}) {
        const localDate = ns.utils.utcToLocal(date);
        const defaultOptions = { year: 'numeric', month: 'short', day: 'numeric' };
        return localDate.toLocaleDateString('en-US', { ...defaultOptions, ...options });
    };

    /**
     * Format a date/time for display in configured timezone
     * @param {Date|string} date - Date to format
     * @param {object} options - Intl.DateTimeFormat options
     * @returns {string} Formatted date/time string
     */
    ns.utils.formatDateTime = function (date, options = {}) {
        const localDate = ns.utils.utcToLocal(date);
        const defaultOptions = { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true 
        };
        return localDate.toLocaleString('en-US', { ...defaultOptions, ...options });
    };

    /**
     * Convert local date to date input format (YYYY-MM-DD) in configured timezone
     * @param {Date|string} date - Date to convert
     * @returns {string} Date in YYYY-MM-DD format
     */
    ns.utils.toDateInputLocal = function (date) {
        const utcDate = date instanceof Date ? date : new Date(date);
        const offset = ns.utils.getTimezoneOffset();
        
        // Add timezone offset to UTC time
        const localTime = utcDate.getTime() + (offset * 60 * 60 * 1000);
        const localDate = new Date(localTime);
        
        // Use UTC methods to extract components (which now represent local time)
        const year = localDate.getUTCFullYear();
        const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(localDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    /**
     * Parse date input (YYYY-MM-DD) as local date and convert to UTC
     * @param {string} dateString - Date string in YYYY-MM-DD format
     * @returns {Date} UTC date object
     */
    ns.utils.parseDateInputAsLocal = function (dateString) {
        if (!dateString) return null;
        // Create date at midnight in local timezone
        const [year, month, day] = dateString.split('-').map(Number);
        const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
        return ns.utils.localToUtc(localDate);
    };

    /**
     * Get start of day in UTC for a given local date
     * @param {Date|string} localDate - Local date
     * @returns {Date} UTC date at start of day in local timezone
     */
    ns.utils.getStartOfDayUTC = function (localDate) {
        const date = localDate instanceof Date ? localDate : new Date(localDate);
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const localStartOfDay = new Date(year, month, day, 0, 0, 0, 0);
        return ns.utils.localToUtc(localStartOfDay);
    };

    /**
     * Get end of day in UTC for a given local date
     * @param {Date|string} localDate - Local date
     * @returns {Date} UTC date at end of day in local timezone
     */
    ns.utils.getEndOfDayUTC = function (localDate) {
        const date = localDate instanceof Date ? localDate : new Date(localDate);
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const localEndOfDay = new Date(year, month, day, 23, 59, 59, 999);
        return ns.utils.localToUtc(localEndOfDay);
    };

})();

