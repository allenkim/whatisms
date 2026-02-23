/**
 * Tab 3: Harvey Epstein Feed
 * Two-column layout: Epstein news/legislation + Neighborhood news.
 */

async function loadEpsteinTab() {
    await Promise.all([
        loadEpsteinFeed(),
        loadNeighborhoodFeed(),
    ]);
}

async function loadEpsteinFeed() {
    const container = document.getElementById('epstein-feed');

    try {
        const resp = await fetch('/api/epstein/feed?limit=100');
        const items = await resp.json();

        if (!items.length) {
            container.innerHTML = `
                <div style="padding: 20px; color: var(--text-muted); text-align: center;">
                    No feed items yet. News and legislative data will appear after the first fetch cycle (may take a few minutes).
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => {
            const icon = getItemIcon(item.type, item.feed_name);
            const date = item.date ? formatDate(item.date) : '';
            const sourceText = item.source || item.feed_name || '';

            return `
                <div class="feed-item">
                    <div class="feed-icon" style="background: ${icon.bg};">${icon.emoji}</div>
                    <div class="feed-body">
                        <div class="feed-title">
                            ${item.url
                                ? `<a href="${escapeAttr(item.url)}" target="_blank">${escapeHtml(item.title)}</a>`
                                : escapeHtml(item.title)
                            }
                        </div>
                        <div class="feed-meta">
                            ${date}${sourceText ? ` &mdash; ${escapeHtml(sourceText)}` : ''}
                            ${item.type === 'legislation'
                                ? ' <span class="badge" style="background: rgba(159,79,247,0.15); color: #9f4ff7;">Legislation</span>'
                                : ''
                            }
                        </div>
                        ${item.description
                            ? `<div class="feed-description">${escapeHtml(truncate(item.description, 200))}</div>`
                            : ''
                        }
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load Epstein feed:', e);
        container.innerHTML = `
            <div style="padding: 20px; color: var(--text-muted);">
                Failed to load feed. Backend may still be starting up.
            </div>
        `;
    }
}

async function loadNeighborhoodFeed() {
    const container = document.getElementById('neighborhood-feed');

    try {
        const resp = await fetch('/api/news/district?limit=100');
        const items = await resp.json();

        if (!items.length) {
            container.innerHTML = `
                <div style="padding: 20px; color: var(--text-muted); text-align: center;">
                    No neighborhood news yet. Articles will appear after the first fetch cycle.
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => {
            const date = item.published_at ? formatDate(item.published_at) : '';
            const sourceText = item.source || item.feed_name || '';
            const isHyperlocal = item.is_hyperlocal;

            return `
                <div class="feed-item">
                    <div class="feed-icon" style="background: rgba(79, 247, 122, 0.15);">${isHyperlocal ? '\ud83c\udfe0' : '\ud83d\udcf0'}</div>
                    <div class="feed-body">
                        <div class="feed-title">
                            ${item.url
                                ? `<a href="${escapeAttr(item.url)}" target="_blank">${escapeHtml(item.title)}</a>`
                                : escapeHtml(item.title)
                            }
                        </div>
                        <div class="feed-meta">
                            ${date}${sourceText ? ` &mdash; ${escapeHtml(sourceText)}` : ''}
                            ${isHyperlocal
                                ? ' <span class="badge" style="background: rgba(79,247,122,0.15); color: #4ff77a;">Local</span>'
                                : ''
                            }
                        </div>
                        ${item.summary
                            ? `<div class="feed-description">${escapeHtml(truncate(item.summary, 200))}</div>`
                            : ''
                        }
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Failed to load neighborhood feed:', e);
        container.innerHTML = `
            <div style="padding: 20px; color: var(--text-muted);">
                Failed to load neighborhood news.
            </div>
        `;
    }
}

function getItemIcon(type, feedName) {
    if (type === 'legislation') {
        return { emoji: '\u2696\ufe0f', bg: 'rgba(159, 79, 247, 0.15)' };
    }
    if (feedName && feedName.includes('neighborhood')) {
        return { emoji: '\ud83d\udcf0', bg: 'rgba(79, 247, 122, 0.15)' };
    }
    return { emoji: '\ud83d\udcf0', bg: 'rgba(79, 143, 247, 0.15)' };
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return Math.floor(diffHours) + 'h ago';
        if (diffHours < 48) return 'Yesterday';
        if (diffHours < 168) return Math.floor(diffHours / 24) + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

