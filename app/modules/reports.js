/* Reports module for LitePos
   KPIs, charts, export/print report functions
   Exposes window.LitePos.reports
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
    function formatMoney(v) { if (UTILS && typeof UTILS.formatMoney === 'function') return UTILS.formatMoney(v); const n = Number(v || 0); return '৳ ' + n.toFixed(2); }
    function shortMoney(v) { if (UTILS && typeof UTILS.shortMoney === 'function') return UTILS.shortMoney(v); const n = Number(v || 0); if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'; if (n >= 1000) return (n / 1000).toFixed(1) + 'k'; return n.toFixed(0); }
    function toDateInput(d) { if (UTILS && typeof UTILS.toDateInput === 'function') return UTILS.toDateInput(d); const date = d instanceof Date ? d : new Date(d); const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0'); return `${year}-${month}-${day}`; }

    function computeProfitForSale(sale) {
        let gross = 0;
        (sale.items || []).forEach(it => {
            gross += (it.price - (it.buyPrice || 0)) * it.qty;
        });
        return gross - (sale.discount || 0);
    }

    function refreshKpis() {
        const els = _getEls();
        const db = _getDb();
        const closed = (db.sales || []).filter(s => s.status === 'closed');
        let totalValue = 0;
        let totalProfit = 0;
        closed.forEach(s => { totalValue += s.total || 0; totalProfit += computeProfitForSale(s); });

        if (els['kpi-total-sales']) els['kpi-total-sales'].textContent = formatMoney(totalValue);
        if (els['kpi-total-sales-count']) els['kpi-total-sales-count'].textContent = `${closed.length} invoices`;
        if (els['kpi-total-profit']) els['kpi-total-profit'].textContent = formatMoney(totalProfit);
        if (els['kpi-profit-margin']) els['kpi-profit-margin'].textContent = totalValue > 0 ? `${((totalProfit / totalValue) * 100).toFixed(1)}% margin` : '—';

        const todayStr = toDateInput(new Date());
        let todayValue = 0; let todayCount = 0;
        closed.forEach(s => { const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date())); if (dStr === todayStr) { todayValue += s.total || 0; todayCount++; } });
        if (els['kpi-today-sales']) els['kpi-today-sales'].textContent = formatMoney(todayValue);
        if (els['kpi-today-sales-count']) els['kpi-today-sales-count'].textContent = `${todayCount} invoices`;

        if (els['kpi-customers-count']) els['kpi-customers-count'].textContent = String((db.customers || []).length || 0);
        const openCount = (db.sales || []).filter(s => s.status === 'open').length;
        if (els['kpi-open-sales']) els['kpi-open-sales'].textContent = String(openCount);

        renderTodaySnapshot();
    }

    function renderTodaySnapshot() {
        const els = _getEls();
        const db = _getDb();
        const closed = (db.sales || []).filter(s => s.status === 'closed');
        const todayStr = toDateInput(new Date());
        let todayValue = 0; let todayCount = 0; let lastSale = null;
        closed.forEach(s => {
            const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date()));
            if (dStr === todayStr) {
                todayValue += s.total || 0; todayCount++;
                if (!lastSale || (s.createdAt || '').localeCompare(lastSale.createdAt || '') > 0) lastSale = s;
            }
        });

        if (els['today-summary-small']) els['today-summary-small'].textContent = todayCount ? `${todayCount} sale(s) · ${formatMoney(todayValue)}` : 'No sales yet today.';
        if (els['today-salesperson-name']) els['today-salesperson-name'].textContent = window.currentUser ? window.currentUser.name : '—';
        if (els['today-last-sale']) els['today-last-sale'].textContent = lastSale ? `${lastSale.id} · ${formatMoney(lastSale.total || 0)}` : '—';
    }

    function drawSalesChart() {
        const els = _getEls();
        const db = _getDb();
        const canvas = els['salesChart'];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.clientWidth || 400; const height = 200; canvas.width = width; canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        const days = []; const today = new Date(); for (let i = 6; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400000); days.push(toDateInput(d)); }
        const totals = days.map(dStr => { return (db.sales || []).filter(s => s.status === 'closed').filter(s => toDateInput(new Date(s.createdAt || s.updatedAt || new Date())) === dStr).reduce((sum, s) => sum + (s.total || 0), 0); });
        const max = Math.max(...totals, 1);
        const paddingLeft = 40; const paddingRight = 10; const paddingBottom = 20; const paddingTop = 20; const chartWidth = width - paddingLeft - paddingRight; const chartHeight = height - paddingTop - paddingBottom;
        ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#9ca3af'; ctx.strokeStyle = '#4b5563';
        ctx.beginPath(); ctx.moveTo(paddingLeft, paddingTop); ctx.lineTo(paddingLeft, paddingTop + chartHeight); ctx.lineTo(paddingLeft + chartWidth, paddingTop + chartHeight); ctx.stroke();
        const barWidth = chartWidth / (days.length * 1.4); const gap = barWidth * 0.4;
        totals.forEach((val, idx) => {
            const x = paddingLeft + idx * (barWidth + gap) + gap; const heightRatio = val / max; const barHeight = chartHeight * heightRatio; const y = paddingTop + chartHeight - barHeight;
            ctx.fillStyle = '#22c55e'; ctx.fillRect(x, y, barWidth, barHeight);
            ctx.fillStyle = '#e5e7eb'; ctx.textAlign = 'center'; ctx.fillText(val > 0 ? shortMoney(val) : '', x + barWidth / 2, y - 4);
            const label = days[idx].slice(5); ctx.fillStyle = '#9ca3af'; ctx.textAlign = 'center'; ctx.fillText(label, x + barWidth / 2, paddingTop + chartHeight + 13);
        });
    }

    function exportCsvReport() {
        const els = _getEls();
        const db = _getDb();
        const from = els['report-from'] && els['report-from'].value; const to = els['report-to'] && els['report-to'].value;
        const closed = (db.sales || []).filter(s => s.status === 'closed');
        const filtered = closed.filter(s => { if (!from && !to) return true; const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date())); if (from && dStr < from) return false; if (to && dStr > to) return false; return true; });
        if (!filtered.length) { if (UI && typeof UI.showToast === 'function') UI.showToast('Export', 'No closed sales in selected period.', 'error'); else console.error('No closed sales in selected period.'); return; }
        const rows = []; rows.push(['Invoice','Date','Customer','Phone','Salesperson','Items','Total','Discount','Payment','Change','Profit']);
        filtered.forEach(s => { const d = new Date(s.createdAt || s.updatedAt || new Date()); const customerName = s.customer && s.customer.name ? s.customer.name : 'Walk-in'; const phone = s.customer && s.customer.phone ? s.customer.phone : ''; const user = (db.users || []).find(u => u.id === s.salespersonId); const itemsCount = (s.items || []).reduce((sum, it) => sum + it.qty, 0); const profit = computeProfitForSale(s); rows.push([s.id, d.toISOString(), customerName, phone, user ? user.name : '', String(itemsCount), s.total || 0, s.discount || 0, s.payment || 0, s.change || 0, profit]); });
        const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const todayStr = toDateInput(new Date()).replace(/-/g, ''); a.download = `litepos-report-${todayStr}.csv`; a.click(); URL.revokeObjectURL(url);
        if (UI && typeof UI.showToast === 'function') UI.showToast('Export', 'CSV report downloaded.', 'success');
    }

    function printReport() {
        const els = _getEls();
        const db = _getDb();
        const from = els['report-from'] && els['report-from'].value; const to = els['report-to'] && els['report-to'].value;
        const closed = (db.sales || []).filter(s => s.status === 'closed');
        const filtered = closed.filter(s => { if (!from && !to) return true; const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date())); if (from && dStr < from) return false; if (to && dStr > to) return false; return true; });
        const tbody = els['report-print-body']; if (!tbody) return; tbody.innerHTML = '';
        const byDay = {};
        filtered.forEach(s => { const dStr = toDateInput(new Date(s.createdAt || s.updatedAt || new Date())); if (!byDay[dStr]) byDay[dStr] = { invoices: 0, total: 0, profit: 0 }; byDay[dStr].invoices++; byDay[dStr].total += s.total || 0; byDay[dStr].profit += computeProfitForSale(s); });
        Object.keys(byDay).sort().forEach(day => { const row = byDay[day]; const tr = document.createElement('tr'); const tdDate = document.createElement('td'); tdDate.textContent = day; const tdInv = document.createElement('td'); tdInv.textContent = String(row.invoices); const tdTotal = document.createElement('td'); tdTotal.textContent = formatMoney(row.total); const tdProfit = document.createElement('td'); tdProfit.textContent = formatMoney(row.profit); tr.appendChild(tdDate); tr.appendChild(tdInv); tr.appendChild(tdTotal); tr.appendChild(tdProfit); tbody.appendChild(tr); });
        if (els['report-print-period']) els['report-print-period'].textContent = `Period: ${from || '—'} to ${to || '—'}`;
        document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500);
    }

    window.LitePos.reports = {
        refreshKpis,
        renderTodaySnapshot,
        drawSalesChart,
        exportCsvReport,
        printReport,
        computeProfitForSale
    };

})();
