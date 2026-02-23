/**
 * Shared utility functions for the district2 frontend.
 */

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

/**
 * Show an inline error message in a container element.
 * @param {string} containerId — DOM id of the container to show the error in
 * @param {string} message — user-facing error message
 */
function showLoadError(containerId, message) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div class="loading-overlay" style="color: var(--red);">${escapeHtml(message)}</div>`;
}
