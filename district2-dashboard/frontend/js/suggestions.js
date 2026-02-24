/**
 * Tab 5: Suggestions
 * Lightweight task board for site feedback, bug reports, and improvement ideas.
 */

let allSuggestions = [];
let currentFilter = 'active';
let currentUserRole = null;

async function loadSuggestionsTab() {
    try {
        const [meResp, sugResp] = await Promise.all([
            fetch('/auth/me'),
            fetch('/api/suggestions'),
        ]);

        if (!meResp.ok || !sugResp.ok) throw new Error('Failed to load');

        const meData = await meResp.json();
        currentUserRole = meData.user.role;

        allSuggestions = await sugResp.json();
        updateSuggestionStats();
        renderSuggestions();
    } catch (e) {
        console.error('Failed to load suggestions:', e);
        showLoadError('suggestions-list', 'Failed to load suggestions.');
    }
}

function updateSuggestionStats() {
    const open = allSuggestions.filter(s => s.status === 'open').length;
    const progress = allSuggestions.filter(s => s.status === 'in_progress').length;
    const completed = allSuggestions.filter(s => s.status === 'completed').length;
    document.getElementById('stat-sug-open').textContent = open;
    document.getElementById('stat-sug-progress').textContent = progress;
    document.getElementById('stat-sug-completed').textContent = completed;
}

function renderSuggestions() {
    const container = document.getElementById('suggestions-list');

    let filtered;
    if (currentFilter === 'active') {
        filtered = allSuggestions.filter(s => s.status !== 'completed');
    } else if (currentFilter === 'archived') {
        filtered = allSuggestions.filter(s => s.status === 'completed');
    } else {
        filtered = allSuggestions;
    }

    if (!filtered.length) {
        const msg = currentFilter === 'archived'
            ? 'No archived suggestions yet.'
            : currentFilter === 'active'
                ? 'No suggestions yet. Click "+ New Suggestion" to submit one!'
                : 'No suggestions yet.';
        container.innerHTML = `<div class="loading-overlay" style="color: var(--text-muted);">${escapeHtml(msg)}</div>`;
        return;
    }

    container.innerHTML = filtered.map(s => {
        const typeLabel = s.type.charAt(0).toUpperCase() + s.type.slice(1);
        const statusLabel = s.status === 'in_progress' ? 'In Progress'
            : s.status.charAt(0).toUpperCase() + s.status.slice(1);

        const adminActions = currentUserRole === 'admin' ? `
            <div class="suggestion-actions">
                <button onclick="openStatusModal(${s.id}, '${escapeAttr(s.status)}', '${escapeAttr(s.admin_note || '')}')">Update</button>
                <button class="btn-delete" onclick="deleteSuggestion(${s.id})">Delete</button>
            </div>` : '';

        const adminNote = s.admin_note ? `
            <div class="suggestion-admin-note">
                <strong>Admin Note</strong><br>
                ${escapeHtml(s.admin_note)}
            </div>` : '';

        const desc = s.description ? `<div class="suggestion-desc">${escapeHtml(s.description)}</div>` : '';

        return `
            <div class="suggestion-card">
                <div class="suggestion-header">
                    <span class="suggestion-title">${escapeHtml(s.title)}</span>
                    <span class="badge type-${escapeAttr(s.type)}">${escapeHtml(typeLabel)}</span>
                    <span class="badge status-${escapeAttr(s.status)}">${escapeHtml(statusLabel)}</span>
                </div>
                ${desc}
                <div class="suggestion-footer">
                    <span>by ${escapeHtml(s.username)}</span>
                    <span>${formatSuggestionDate(s.created_at)}</span>
                    ${adminActions}
                </div>
                ${adminNote}
            </div>`;
    }).join('');
}

function formatSuggestionDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
}

function setSuggestionFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.suggestions-header .period-btn').forEach(b => b.classList.remove('filter-active'));
    btn.classList.add('filter-active');
    renderSuggestions();
}

// Submit modal
function openSuggestionModal() {
    document.getElementById('sug-type').value = 'suggestion';
    document.getElementById('sug-title').value = '';
    document.getElementById('sug-desc').value = '';
    document.getElementById('suggestion-modal').style.display = 'flex';
}

function closeSuggestionModal() {
    document.getElementById('suggestion-modal').style.display = 'none';
}

async function submitSuggestion() {
    const title = document.getElementById('sug-title').value.trim();
    const description = document.getElementById('sug-desc').value.trim() || null;
    const type = document.getElementById('sug-type').value;

    if (!title) {
        alert('Please enter a title.');
        return;
    }

    try {
        const resp = await fetch('/api/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, type }),
        });
        if (!resp.ok) throw new Error('Failed to submit');
        closeSuggestionModal();
        await refreshSuggestions();
    } catch (e) {
        console.error('Failed to submit suggestion:', e);
        alert('Failed to submit suggestion. Please try again.');
    }
}

// Admin status modal
function openStatusModal(id, currentStatus, currentNote) {
    document.getElementById('sug-update-id').value = id;
    document.getElementById('sug-new-status').value = currentStatus;
    document.getElementById('sug-admin-note').value = currentNote;
    document.getElementById('suggestion-status-modal').style.display = 'flex';
}

function closeStatusModal() {
    document.getElementById('suggestion-status-modal').style.display = 'none';
}

async function submitStatusUpdate() {
    const id = document.getElementById('sug-update-id').value;
    const status = document.getElementById('sug-new-status').value;
    const admin_note = document.getElementById('sug-admin-note').value.trim() || null;

    try {
        const resp = await fetch(`/api/suggestions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, admin_note }),
        });
        if (!resp.ok) throw new Error('Failed to update');
        closeStatusModal();
        await refreshSuggestions();
    } catch (e) {
        console.error('Failed to update suggestion:', e);
        alert('Failed to update suggestion. Please try again.');
    }
}

async function deleteSuggestion(id) {
    if (!confirm('Delete this suggestion?')) return;
    try {
        const resp = await fetch(`/api/suggestions/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Failed to delete');
        await refreshSuggestions();
    } catch (e) {
        console.error('Failed to delete suggestion:', e);
        alert('Failed to delete suggestion.');
    }
}

async function refreshSuggestions() {
    try {
        const resp = await fetch('/api/suggestions');
        if (!resp.ok) throw new Error('Failed to fetch');
        allSuggestions = await resp.json();
        updateSuggestionStats();
        renderSuggestions();
    } catch (e) {
        console.error('Failed to refresh suggestions:', e);
    }
}
