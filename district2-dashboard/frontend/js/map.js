/**
 * Tab 1: Interactive District 2 Pin Map
 * Users can search addresses, right-click to pin, CRUD pins with tag-based filtering.
 */

const DISTRICT_CENTER = [40.731, -73.985];
const DEFAULT_ZOOM = 14;

// State
let allTags = [];
let allPins = [];
let activeTagFilters = new Set();
let pinMarkers = {};

// Initialize map
const districtMap = L.map('district-map', {
    zoomControl: true,
    scrollWheelZoom: true,
}).setView(DISTRICT_CENTER, DEFAULT_ZOOM);

window.districtMap = districtMap;

// Dark tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
}).addTo(districtMap);

// Layer groups
const boundaryLayer = L.layerGroup().addTo(districtMap);
const pinLayer = L.layerGroup().addTo(districtMap);

// ── District Boundary ────────────────────────────────────────────────────────

async function loadBoundary() {
    try {
        const resp = await fetch('/api/district/boundary');
        const geojson = await resp.json();
        if (geojson.features && geojson.features.length > 0) {
            L.geoJSON(geojson, {
                style: {
                    color: '#4f8ff7',
                    weight: 2,
                    opacity: 0.6,
                    fillColor: '#4f8ff7',
                    fillOpacity: 0.05,
                },
            }).addTo(boundaryLayer);
        }
    } catch (e) {
        console.error('Failed to load boundary:', e);
    }
}

// ── Tags ─────────────────────────────────────────────────────────────────────

async function loadTags() {
    try {
        const resp = await fetch('/api/pins/tags');
        allTags = await resp.json();
        activeTagFilters = new Set(allTags.map(t => t.name));
        renderTagFilters();
        populateTagDropdown();
    } catch (e) {
        console.error('Failed to load tags:', e);
    }
}

function renderTagFilters() {
    const container = document.getElementById('tag-filters');
    container.innerHTML = allTags.map(tag => {
        const checked = activeTagFilters.has(tag.name) ? 'checked' : '';
        return `
            <label class="tag-filter-label" style="--tag-color: ${tag.color};">
                <input type="checkbox" class="tag-filter-cb" data-tag="${escapeAttr(tag.name)}" ${checked}>
                <span class="tag-dot" style="background: ${tag.color};"></span>
                ${escapeHtml(tag.name)}
            </label>
        `;
    }).join('');

    container.querySelectorAll('.tag-filter-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                activeTagFilters.add(cb.dataset.tag);
            } else {
                activeTagFilters.delete(cb.dataset.tag);
            }
            renderPinMarkers();
        });
    });
}

function populateTagDropdown() {
    const select = document.getElementById('pin-tag');
    select.innerHTML = allTags.map(t =>
        `<option value="${escapeAttr(t.name)}" style="color: ${t.color};">${escapeHtml(t.name)}</option>`
    ).join('');
}

function getTagColor(tagName) {
    const tag = allTags.find(t => t.name === tagName);
    return tag ? tag.color : '#9f4ff7';
}

// ── Pins ─────────────────────────────────────────────────────────────────────

async function loadPins() {
    try {
        const resp = await fetch('/api/pins');
        allPins = await resp.json();
        renderPinMarkers();
        renderPinList();
    } catch (e) {
        console.error('Failed to load pins:', e);
    }
}

function createPinMarker(pin) {
    const color = getTagColor(pin.tag);

    const icon = L.divIcon({
        className: 'pin-marker-icon',
        html: `<div class="pin-marker" style="background: ${color}; border-color: ${color};"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10],
    });

    const marker = L.marker([pin.latitude, pin.longitude], { icon });

    const date = pin.created_at ? new Date(pin.created_at).toLocaleDateString() : '';
    marker.bindPopup(`
        <div style="font-family: sans-serif; max-width: 280px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span class="tag-badge" style="background: ${color}20; color: ${color};">${escapeHtml(pin.tag)}</span>
            </div>
            ${pin.address ? `<div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(pin.address)}</div>` : ''}
            ${pin.description ? `<div style="font-size: 13px; margin-bottom: 6px;">${escapeHtml(pin.description)}</div>` : ''}
            <div style="font-size: 11px; color: #666; margin-bottom: 8px;">${date}</div>
            <div style="display: flex; gap: 8px;">
                <button onclick="openEditPinModal(${pin.id})" style="cursor:pointer; background: #4f8ff7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">Edit</button>
                <button onclick="deletePin(${pin.id})" style="cursor:pointer; background: #f74f4f; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px;">Delete</button>
            </div>
        </div>
    `);

    return marker;
}

function renderPinMarkers() {
    pinLayer.clearLayers();
    pinMarkers = {};

    allPins.forEach(pin => {
        if (activeTagFilters.has(pin.tag)) {
            const marker = createPinMarker(pin);
            marker.addTo(pinLayer);
            pinMarkers[pin.id] = marker;
        }
    });
}

function renderPinList() {
    const list = document.getElementById('pin-list');
    const visiblePins = allPins.filter(p => activeTagFilters.has(p.tag));

    if (!visiblePins.length) {
        list.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No pins yet. Right-click the map or search an address to add one.</div>';
        return;
    }

    list.innerHTML = visiblePins.map(pin => {
        const color = getTagColor(pin.tag);
        const date = pin.created_at ? new Date(pin.created_at).toLocaleDateString() : '';
        return `
            <div class="event-item" onclick="panToPin(${pin.id})">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
                    <span class="event-title">${escapeHtml(pin.address || pin.description || 'Pin #' + pin.id)}</span>
                </div>
                <div class="event-time">${escapeHtml(pin.tag)} &mdash; ${date}</div>
                ${pin.description ? `<div class="event-address">${escapeHtml(truncate(pin.description, 60))}</div>` : ''}
            </div>
        `;
    }).join('');
}

function panToPin(pinId) {
    const marker = pinMarkers[pinId];
    if (marker) {
        districtMap.setView(marker.getLatLng(), 17);
        marker.openPopup();
    }
}

// ── Pin CRUD ─────────────────────────────────────────────────────────────────

function openCreatePinModal(lat, lng) {
    document.getElementById('pin-modal-title').textContent = 'Add Pin';
    document.getElementById('pin-edit-id').value = '';
    document.getElementById('pin-address').value = '';
    document.getElementById('pin-description').value = '';
    document.getElementById('pin-tag').value = 'General';
    document.getElementById('pin-lat').value = lat.toFixed(6);
    document.getElementById('pin-lng').value = lng.toFixed(6);
    document.getElementById('pin-modal').style.display = 'flex';
}

function openEditPinModal(pinId) {
    const pin = allPins.find(p => p.id === pinId);
    if (!pin) return;

    // Close any open popup first
    districtMap.closePopup();

    document.getElementById('pin-modal-title').textContent = 'Edit Pin';
    document.getElementById('pin-edit-id').value = pinId;
    document.getElementById('pin-address').value = pin.address || '';
    document.getElementById('pin-description').value = pin.description || '';
    document.getElementById('pin-tag').value = pin.tag || 'General';
    document.getElementById('pin-lat').value = pin.latitude;
    document.getElementById('pin-lng').value = pin.longitude;
    document.getElementById('pin-modal').style.display = 'flex';
}

function closePinModal() {
    document.getElementById('pin-modal').style.display = 'none';
}

async function savePin() {
    const editId = document.getElementById('pin-edit-id').value;
    const payload = {
        latitude: parseFloat(document.getElementById('pin-lat').value),
        longitude: parseFloat(document.getElementById('pin-lng').value),
        address: document.getElementById('pin-address').value || null,
        description: document.getElementById('pin-description').value || null,
        tag: document.getElementById('pin-tag').value,
    };

    try {
        if (editId) {
            await fetch(`/api/pins/${editId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            await fetch('/api/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        closePinModal();
        await loadPins();
    } catch (e) {
        console.error('Failed to save pin:', e);
    }
}

async function deletePin(pinId) {
    if (!confirm('Delete this pin?')) return;
    try {
        await fetch(`/api/pins/${pinId}`, { method: 'DELETE' });
        districtMap.closePopup();
        await loadPins();
    } catch (e) {
        console.error('Failed to delete pin:', e);
    }
}

// ── Address Search / Geocoding ───────────────────────────────────────────────

async function geocodeAddress() {
    const address = document.getElementById('address-input').value.trim();
    if (!address) return;

    const resultsDiv = document.getElementById('geocode-results');

    try {
        const resp = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
        const results = await resp.json();

        if (!results.length) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div style="padding: 8px; color: var(--text-muted);">No results found.</div>';
            return;
        }

        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = results.map((r, i) => `
            <div class="geocode-result-item" onclick="selectGeocodeResult(${r.lat}, ${r.lon}, '${escapeAttr(r.display_name)}')">
                <span style="color: var(--accent);">${i + 1}.</span> ${escapeHtml(truncate(r.display_name, 80))}
            </div>
        `).join('');
    } catch (e) {
        console.error('Geocode failed:', e);
    }
}

function selectGeocodeResult(lat, lon, displayName) {
    document.getElementById('geocode-results').style.display = 'none';
    districtMap.setView([lat, lon], 17);
    openCreatePinModal(lat, lon);
    document.getElementById('pin-address').value = displayName;
}

// ── Event Listeners ──────────────────────────────────────────────────────────

// Right-click on map to add a pin
districtMap.on('contextmenu', (e) => {
    openCreatePinModal(e.latlng.lat, e.latlng.lng);
});

// Search button
document.getElementById('geocode-btn').addEventListener('click', geocodeAddress);

// Enter key on search
document.getElementById('address-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') geocodeAddress();
});

// Modal buttons
document.getElementById('pin-save-btn').addEventListener('click', savePin);
document.getElementById('pin-cancel-btn').addEventListener('click', closePinModal);

// Close modal on overlay click
document.getElementById('pin-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('pin-modal')) closePinModal();
});

// Close geocode results on outside click
document.addEventListener('click', (e) => {
    const resultsDiv = document.getElementById('geocode-results');
    const searchBar = document.querySelector('.address-search');
    if (resultsDiv.style.display !== 'none' && !searchBar.contains(e.target) && !resultsDiv.contains(e.target)) {
        resultsDiv.style.display = 'none';
    }
});

// ── Utilities ────────────────────────────────────────────────────────────────

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

// ── Initialize ───────────────────────────────────────────────────────────────

loadBoundary();
loadTags().then(() => loadPins());
