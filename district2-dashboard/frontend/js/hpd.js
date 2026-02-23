/**
 * Tab 4: HPD Violations Tracker
 * Violation summary, trend charts, landlord offender rankings, and detailed tables.
 */

let hpdPeriod = 'monthly';
let hpdFromDate = '';
let hpdToDate = '';
let chartHpdTrend = null;
let chartHpdCategories = null;

async function loadHpdTab() {
    await Promise.all([
        loadHpdStats(),
        loadHpdTrend(),
        loadHpdCategories(),
        loadOffendersTable(),
        loadViolationsTable(),
    ]);
}

function hpdDateParams() {
    let params = '';
    if (hpdFromDate) params += `&from_date=${hpdFromDate}`;
    if (hpdToDate) params += `&to_date=${hpdToDate}`;
    return params;
}

// Period selector for HPD tab
document.querySelectorAll('#hpd-period-selector .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#hpd-period-selector .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        hpdPeriod = btn.dataset.period;
        // Clear date range when using period selector
        hpdFromDate = '';
        hpdToDate = '';
        document.getElementById('hpd-from-date').value = '';
        document.getElementById('hpd-to-date').value = '';
        loadHpdTab();
    });
});

// Date range apply/clear
document.getElementById('hpd-date-apply').addEventListener('click', () => {
    hpdFromDate = document.getElementById('hpd-from-date').value;
    hpdToDate = document.getElementById('hpd-to-date').value;
    if (hpdFromDate || hpdToDate) {
        // Deactivate period buttons when custom range is active
        document.querySelectorAll('#hpd-period-selector .period-btn').forEach(b => b.classList.remove('active'));
        loadHpdTab();
    }
});

document.getElementById('hpd-date-clear').addEventListener('click', () => {
    hpdFromDate = '';
    hpdToDate = '';
    document.getElementById('hpd-from-date').value = '';
    document.getElementById('hpd-to-date').value = '';
    // Re-activate monthly
    document.querySelectorAll('#hpd-period-selector .period-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#hpd-period-selector .period-btn[data-period="monthly"]').classList.add('active');
    hpdPeriod = 'monthly';
    loadHpdTab();
});

// Violation class filter
document.getElementById('violation-class-filter').addEventListener('change', loadViolationsTable);

async function loadHpdStats() {
    try {
        const dateParams = hpdDateParams();
        const resp = await fetch(`/api/hpd/violations/summary?period=${hpdPeriod}${dateParams}`);
        const data = await resp.json();

        document.getElementById('stat-hpd-total').textContent = (data.total || 0).toLocaleString();
        document.getElementById('stat-hpd-c').textContent = (data.class_c || 0).toLocaleString();
        document.getElementById('stat-hpd-b').textContent = (data.class_b || 0).toLocaleString();
        document.getElementById('stat-hpd-a').textContent = (data.class_a || 0).toLocaleString();

        const change = data.pct_change || 0;
        const changeEl = document.getElementById('stat-hpd-change');
        if (data.period === 'custom') {
            changeEl.textContent = 'Custom range';
            changeEl.className = 'stat-change neutral';
        } else if (change > 0) {
            changeEl.textContent = `+${change}% vs prev period`;
            changeEl.className = 'stat-change up';
        } else if (change < 0) {
            changeEl.textContent = `${change}% vs prev period`;
            changeEl.className = 'stat-change down';
        } else {
            changeEl.textContent = 'No change';
            changeEl.className = 'stat-change neutral';
        }
    } catch (e) {
        console.error('Failed to load HPD stats:', e);
        document.getElementById('stat-hpd-total').textContent = 'Error';
    }
}

async function loadHpdTrend() {
    try {
        const months = hpdPeriod === 'daily' ? 1 : hpdPeriod === 'weekly' ? 3 : 6;
        const dateParams = hpdDateParams();
        const resp = await fetch(`/api/hpd/violations/trend?months=${months}${dateParams}`);
        const data = await resp.json();

        const labels = data.map(d => d.date);

        if (chartHpdTrend) chartHpdTrend.destroy();
        chartHpdTrend = new Chart(document.getElementById('chart-hpd-trend'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Class C',
                        data: data.map(d => d.class_c),
                        borderColor: '#f74f4f',
                        backgroundColor: 'rgba(247, 79, 79, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 1,
                        borderWidth: 2,
                    },
                    {
                        label: 'Class B',
                        data: data.map(d => d.class_b),
                        borderColor: '#f7a94f',
                        backgroundColor: 'rgba(247, 169, 79, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 1,
                        borderWidth: 2,
                    },
                    {
                        label: 'Class A',
                        data: data.map(d => d.class_a),
                        borderColor: '#f7e44f',
                        backgroundColor: 'rgba(247, 228, 79, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 1,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { font: { size: 11 }, usePointStyle: true, padding: 12 },
                    },
                },
                scales: {
                    x: {
                        grid: { color: '#30363d' },
                        ticks: { maxTicksLimit: 15, font: { size: 10 } },
                    },
                    y: { grid: { color: '#30363d' }, beginAtZero: true },
                },
            },
        });
    } catch (e) {
        console.error('Failed to load HPD trend:', e);
        showLoadError('chart-hpd-trend', 'Failed to load trend data.');
    }
}

async function loadHpdCategories() {
    try {
        const resp = await fetch(`/api/hpd/complaints/categories?period=${hpdPeriod}`);
        const data = await resp.json();

        const top = data.slice(0, 8);
        const otherCount = data.slice(8).reduce((sum, d) => sum + d.count, 0);
        if (otherCount > 0) top.push({ major_category: 'Other', count: otherCount });

        const labels = top.map(d => truncate(d.major_category || 'Unknown', 25));
        const values = top.map(d => d.count);

        const CHART_COLORS = [
            '#4f8ff7', '#f74f4f', '#f7a94f', '#4ff77a', '#9f4ff7',
            '#f7e44f', '#4ff7f7', '#f74fa9', '#7af74f',
        ];

        if (chartHpdCategories) chartHpdCategories.destroy();
        chartHpdCategories = new Chart(document.getElementById('chart-hpd-categories'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: CHART_COLORS.slice(0, values.length),
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 11 }, padding: 8 },
                    },
                },
            },
        });
    } catch (e) {
        console.error('Failed to load HPD categories:', e);
        showLoadError('chart-hpd-categories', 'Failed to load category data.');
    }
}

async function loadOffendersTable() {
    try {
        const dateParams = hpdDateParams();
        const resp = await fetch(`/api/hpd/violations/offenders?limit=25${dateParams}`);
        const data = await resp.json();

        const tbody = document.getElementById('table-offenders-body');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 20px;">No offender data yet. HPD data will appear after the first fetch cycle.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map((d, i) => {
            const total = d.total_violations || 0;
            const cPct = total > 0 ? (d.class_c / total * 100) : 0;
            const bPct = total > 0 ? (d.class_b / total * 100) : 0;
            const aPct = total > 0 ? (d.class_a / total * 100) : 0;

            // Truncate addresses list
            const addresses = (d.addresses || '').split(',').slice(0, 3).join(', ');
            const moreCount = (d.addresses || '').split(',').length - 3;
            const addrDisplay = moreCount > 0 ? addresses + ` +${moreCount} more` : addresses;

            return `
                <tr>
                    <td class="rank-number">${i + 1}</td>
                    <td>
                        <strong>${escapeHtml(d.owner_name || 'Unknown')}</strong>
                        ${d.owner_type === 'CorporateOwner'
                            ? '<br><span style="font-size: 11px; color: var(--text-muted);">LLC / Corporate</span>'
                            : ''
                        }
                    </td>
                    <td>${d.num_buildings || 0}</td>
                    <td><strong>${total.toLocaleString()}</strong></td>
                    <td>
                        <div style="font-size: 11px; margin-bottom: 4px;">
                            <span style="color: var(--class-c);">${d.class_c || 0}C</span> /
                            <span style="color: var(--class-b);">${d.class_b || 0}B</span> /
                            <span style="color: var(--class-a);">${d.class_a || 0}A</span>
                        </div>
                        <div class="violation-bar">
                            <div class="seg-c" style="width: ${cPct}%"></div>
                            <div class="seg-b" style="width: ${bPct}%"></div>
                            <div class="seg-a" style="width: ${aPct}%"></div>
                        </div>
                    </td>
                    <td style="font-size: 12px;">${escapeHtml(d.head_officer || '-')}</td>
                    <td style="font-size: 12px;">${escapeHtml(d.officer || '-')}</td>
                    <td style="font-size: 12px;">${escapeHtml(d.managing_agent || '-')}</td>
                    <td style="font-size: 12px; color: var(--text-muted);">${escapeHtml(addrDisplay)}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load offenders table:', e);
        document.getElementById('table-offenders-body').innerHTML =
            '<tr><td colspan="9" class="loading-overlay" style="color: var(--red)">Failed to load offender data.</td></tr>';
    }
}

async function loadViolationsTable() {
    try {
        const classFilter = document.getElementById('violation-class-filter').value;
        const classParam = classFilter ? `&violation_class=${classFilter}` : '';
        const dateParams = hpdDateParams();
        const resp = await fetch(`/api/hpd/violations/all?limit=200${classParam}${dateParams}`);
        const data = await resp.json();

        const tbody = document.getElementById('table-violations-body');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No violations data yet.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => {
            const date = d.inspection_date ? new Date(d.inspection_date).toLocaleDateString() : '';
            const classLabel = d.class || '';
            const classCss = classLabel === 'C' ? 'class-c' : classLabel === 'B' ? 'class-b' : 'class-a';

            return `
                <tr>
                    <td>${date}</td>
                    <td><span class="badge ${classCss}">Class ${classLabel}</span></td>
                    <td>${escapeHtml(d.address || '')}</td>
                    <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                        title="${escapeAttr(d.nov_description || '')}">
                        ${escapeHtml(truncate(d.nov_description || '', 80))}
                    </td>
                    <td>${escapeHtml(d.current_status || '')}</td>
                    <td style="font-size: 12px;">${escapeHtml(d.owner_name || 'Unknown')}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load violations table:', e);
        document.getElementById('table-violations-body').innerHTML =
            '<tr><td colspan="6" class="loading-overlay" style="color: var(--red)">Failed to load violations data.</td></tr>';
    }
}

