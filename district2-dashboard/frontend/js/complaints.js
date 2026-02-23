/**
 * Tab 2: 311 & 911 Complaint Analysis
 * Charts for top issues, trends, and type breakdowns with daily/weekly/monthly views.
 */

let currentPeriod = 'monthly';
let chart311Top = null;
let chart911Types = null;
let chart311Trend = null;

// Chart.js dark theme defaults
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const CHART_COLORS = [
    '#4f8ff7', '#f74f4f', '#f7a94f', '#4ff77a', '#9f4ff7',
    '#f7e44f', '#4ff7f7', '#f74fa9', '#7af74f', '#f7914f',
    '#4f4ff7', '#f7f74f', '#4ff7a9', '#a94ff7', '#f74f7a',
];

async function loadComplaintsTab() {
    await Promise.all([
        loadComplaintStats(),
        load311TopIssues(),
        load911Breakdown(),
        load311Trend(),
        load311Table(),
    ]);
}

// Period selector
document.querySelectorAll('#tab-complaints .period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-complaints .period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;
        loadComplaintsTab();
    });
});

async function loadComplaintStats() {
    try {
        const resp = await fetch(`/api/complaints/311/summary?period=${currentPeriod}`);
        const data = await resp.json();

        document.getElementById('stat-311-total').textContent = (data.total_311 || 0).toLocaleString();

        const change = data.pct_change_311 || 0;
        const changeEl = document.getElementById('stat-311-change');
        if (change > 0) {
            changeEl.textContent = `+${change}% vs prev`;
            changeEl.className = 'stat-change up';
        } else if (change < 0) {
            changeEl.textContent = `${change}% vs prev`;
            changeEl.className = 'stat-change down';
        } else {
            changeEl.textContent = 'No change';
            changeEl.className = 'stat-change neutral';
        }
    } catch (e) {
        console.error('Failed to load complaint stats:', e);
    }

    // Load 911 count
    try {
        const resp = await fetch(`/api/complaints/911/breakdown?period=${currentPeriod}`);
        const data = await resp.json();
        const total = data.reduce((sum, d) => sum + d.count, 0);
        document.getElementById('stat-911-total').textContent = total.toLocaleString();
        const changeEl = document.getElementById('stat-911-change');
        if (data.length > 0) {
            changeEl.textContent = `${data.length} call types`;
            changeEl.className = 'stat-change neutral';
        }
    } catch (e) {
        console.error('Failed to load 911 stats:', e);
    }

    // Load top issue
    try {
        const resp = await fetch(`/api/complaints/311/top-issues?period=${currentPeriod}&limit=1`);
        const data = await resp.json();
        if (data.length > 0) {
            document.getElementById('stat-top-issue').textContent = truncate(data[0].complaint_type, 18);
            document.getElementById('stat-top-issue-count').textContent = `${data[0].count} reports`;
        }
    } catch (e) {
        console.error('Failed to load top issue:', e);
    }

    // Resolution rate from table data
    try {
        const resp = await fetch('/api/complaints/311/all?limit=1000');
        const data = await resp.json();
        if (data.length > 0) {
            const closed = data.filter(d => d.status === 'Closed').length;
            const rate = Math.round(closed / data.length * 100);
            document.getElementById('stat-resolution-rate').textContent = rate + '%';
        }
    } catch (e) {
        // ignore
    }
}

async function load311TopIssues() {
    try {
        const resp = await fetch(`/api/complaints/311/top-issues?period=${currentPeriod}&limit=10`);
        const data = await resp.json();

        const labels = data.map(d => truncate(d.complaint_type, 25));
        const values = data.map(d => d.count);

        if (chart311Top) chart311Top.destroy();
        chart311Top = new Chart(document.getElementById('chart-311-top'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: CHART_COLORS.slice(0, values.length),
                    borderRadius: 4,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#30363d' } },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } },
                    },
                },
            },
        });
    } catch (e) {
        console.error('Failed to load 311 top issues chart:', e);
        showLoadError('chart-311-top', 'Failed to load chart data.');
    }
}

async function load911Breakdown() {
    try {
        const resp = await fetch(`/api/complaints/911/breakdown?period=${currentPeriod}`);
        const data = await resp.json();

        const top = data.slice(0, 8);
        const otherCount = data.slice(8).reduce((sum, d) => sum + d.count, 0);
        if (otherCount > 0) top.push({ call_type: 'Other', count: otherCount });

        const labels = top.map(d => truncate(d.call_type || 'Unknown', 25));
        const values = top.map(d => d.count);

        if (chart911Types) chart911Types.destroy();
        chart911Types = new Chart(document.getElementById('chart-911-types'), {
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
        console.error('Failed to load 911 breakdown:', e);
        showLoadError('chart-911-types', 'Failed to load chart data.');
    }
}

async function load311Trend() {
    try {
        const months = currentPeriod === 'daily' ? 1 : currentPeriod === 'weekly' ? 3 : 6;
        const resp = await fetch(`/api/complaints/311/trend?months=${months}`);
        const data = await resp.json();

        const labels = data.map(d => d.date);
        const values = data.map(d => d.count);

        if (chart311Trend) chart311Trend.destroy();
        chart311Trend = new Chart(document.getElementById('chart-311-trend'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '311 Complaints',
                    data: values,
                    borderColor: '#4f8ff7',
                    backgroundColor: 'rgba(79, 143, 247, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 1,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
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
        console.error('Failed to load 311 trend:', e);
        showLoadError('chart-311-trend', 'Failed to load trend data.');
    }
}

async function load311Table() {
    try {
        const resp = await fetch('/api/complaints/311/all?limit=200');
        const data = await resp.json();

        const tbody = document.getElementById('table-311-body');
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No data yet. Data will appear after the first fetch cycle.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => {
            const date = d.created_date ? new Date(d.created_date).toLocaleDateString() : '';
            const statusClass = d.status === 'Closed' ? 'color: var(--green)' : 'color: var(--orange)';
            return `
                <tr>
                    <td>${date}</td>
                    <td>${escapeHtml(d.complaint_type || '')}</td>
                    <td>${escapeHtml(truncate(d.descriptor || '', 40))}</td>
                    <td>${escapeHtml(d.address || '')}</td>
                    <td style="${statusClass}">${escapeHtml(d.status || '')}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load 311 table:', e);
        document.getElementById('table-311-body').innerHTML =
            '<tr><td colspan="5" class="loading-overlay" style="color: var(--red)">Failed to load 311 data.</td></tr>';
    }
}

