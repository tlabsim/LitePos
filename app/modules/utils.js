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

})();
