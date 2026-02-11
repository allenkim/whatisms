/**
 * Tab 1: Interactive Event Map
 * Uses Leaflet.js to display fire, crime, 311, and news events on a map of District 2.
 */

// District 2 center (approx: East Village / Gramercy area)
const DISTRICT_CENTER = [40.731, -73.985];
const DEFAULT_ZOOM = 14;

// Color scheme matching CSS variables
const EVENT_COLORS = {
    fire: '#f74f4f',
    crime: '#4f8ff7',
    '311': '#f7a94f',
    news: '#4ff77a',
    alert: '#f74fa9',
    dob: '#9f4ff7',
};

const SEVERITY_RADIUS = {
    critical: 12,
    high: 10,
    medium: 7,
    low: 5,
};

// Initialize map
const eventMap = L.map('event-map', {
    zoomControl: true,
    scrollWheelZoom: true,
}).setView(DISTRICT_CENTER, DEFAULT_ZOOM);

window.eventMap = eventMap;

// Tile layer (dark theme)
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
}).addTo(eventMap);

// Layer groups for each event type
const layers = {
    fire: L.layerGroup().addTo(eventMap),
    crime: L.layerGroup().addTo(eventMap),
    '311': L.layerGroup().addTo(eventMap),
    news: L.layerGroup().addTo(eventMap),
    alert: L.layerGroup().addTo(eventMap),
    dob: L.layerGroup().addTo(eventMap),
    boundary: L.layerGroup().addTo(eventMap),
};

// Load district boundary
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
            }).addTo(layers.boundary);
        }
    } catch (e) {
        console.error('Failed to load boundary:', e);
    }
}

// Create a circle marker for an event
function createMarker(event) {
    const color = EVENT_COLORS[event.event_type] || '#888';
    const radius = SEVERITY_RADIUS[event.severity] || 7;

    const marker = L.circleMarker([event.latitude, event.longitude], {
        radius: radius,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.5,
    });

    // Popup content
    const date = event.occurred_at ? new Date(event.occurred_at).toLocaleString() : 'Unknown';
    const POPUP_LABELS = { fire: 'Fire', crime: 'Crime', '311': '311', news: 'News', alert: 'Emergency Alert', dob: 'DOB Complaint' };
    const typeLabel = POPUP_LABELS[event.event_type] || event.event_type;
    const linkHtml = event.source_url
        ? `<br><a href="${event.source_url}" target="_blank" style="color: #4f8ff7;">View Source</a>`
        : '';

    marker.bindPopup(`
        <div style="font-family: sans-serif; max-width: 280px;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${color};"></span>
                <strong>${typeLabel}</strong>
            </div>
            <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">${escapeHtml(event.title)}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">${date}</div>
            ${event.address ? `<div style="font-size: 12px; color: #666;">${escapeHtml(event.address)}</div>` : ''}
            ${event.description ? `<div style="font-size: 12px; margin-top: 6px;">${escapeHtml(event.description)}</div>` : ''}
            ${linkHtml}
        </div>
    `);

    return marker;
}

// Load events from API
async function loadMapEvents() {
    const days = document.getElementById('day-select').value;

    // Determine which types are checked
    const types = [];
    if (document.getElementById('filter-fire').checked) types.push('fire');
    if (document.getElementById('filter-crime').checked) types.push('crime');
    if (document.getElementById('filter-311').checked) types.push('311');
    if (document.getElementById('filter-news').checked) types.push('news');
    if (document.getElementById('filter-alert').checked) types.push('alert');
    if (document.getElementById('filter-dob').checked) types.push('dob');

    try {
        const typeParam = types.length > 0 ? `&event_type=${types.join(',')}` : '';
        const resp = await fetch(`/api/events?days=${days}${typeParam}`);
        const events = await resp.json();

        // Clear existing markers
        Object.values(layers).forEach(layer => {
            if (layer !== layers.boundary) layer.clearLayers();
        });

        // Add markers
        let withCoords = 0;
        events.forEach(event => {
            if (event.latitude && event.longitude) {
                const marker = createMarker(event);
                const layerGroup = layers[event.event_type];
                if (layerGroup) {
                    marker.addTo(layerGroup);
                    withCoords++;
                }
            }
        });

        // Update event list
        renderEventList(events);

        console.log(`Map: loaded ${events.length} events (${withCoords} with coordinates)`);
    } catch (e) {
        console.error('Failed to load events:', e);
        document.getElementById('event-list').innerHTML =
            '<div style="padding: 20px; color: var(--text-muted);">Failed to load events. Backend may still be starting up.</div>';
    }
}

// Render the event list sidebar
function renderEventList(events) {
    const list = document.getElementById('event-list');
    if (!events.length) {
        list.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">No events found for this period.</div>';
        return;
    }

    list.innerHTML = events.slice(0, 200).map(event => {
        const color = EVENT_COLORS[event.event_type] || '#888';
        const date = event.occurred_at ? new Date(event.occurred_at).toLocaleString() : '';
        const TYPE_LABELS = { fire: 'Fire', crime: 'Crime', '311': '311', news: 'News', alert: 'Alert', dob: 'DOB' };
        const typeLabel = TYPE_LABELS[event.event_type] || event.event_type;

        return `
            <div class="event-item" data-lat="${event.latitude}" data-lng="${event.longitude}"
                 onclick="panToEvent(${event.latitude}, ${event.longitude})">`;
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
                    <span class="event-title">${escapeHtml(event.title)}</span>
                </div>
                <div class="event-time">${date} &mdash; ${typeLabel}</div>
                ${event.address ? `<div class="event-address">${escapeHtml(event.address)}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Pan map to an event
function panToEvent(lat, lng) {
    if (lat && lng) {
        eventMap.setView([lat, lng], 17);
    }
}

// HTML escape utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners for filters
['filter-fire', 'filter-crime', 'filter-311', 'filter-news', 'filter-alert', 'filter-dob'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadMapEvents);
});

document.getElementById('day-select').addEventListener('change', loadMapEvents);

// Initialize
loadBoundary();
loadMapEvents();
