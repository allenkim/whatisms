/**
 * Tab 3: Harvey Epstein Feed
 * Scrolling feed of news, legislative activity, and social media embeds.
 */

async function loadEpsteinTab() {
    await Promise.all([
        loadEpsteinFeed(),
        loadSocialEmbeds(),
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

async function loadSocialEmbeds() {
    try {
        const resp = await fetch('/api/epstein/social');
        const config = await resp.json();

        // Twitter embed
        const twitterEl = document.getElementById('twitter-embed');
        if (config.twitter) {
            twitterEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <a href="${config.twitter.timeline_url}" target="_blank"
                       style="color: var(--accent); font-weight: 500; font-size: 14px;">
                        @${escapeHtml(config.twitter.handle)} on X/Twitter
                    </a>
                </div>
                ${config.twitter.widget_html}
            `;

            // Load Twitter widget script
            if (!document.querySelector('script[src*="platform.twitter.com"]')) {
                const script = document.createElement('script');
                script.src = config.twitter.script;
                script.async = true;
                script.charset = 'utf-8';
                document.body.appendChild(script);
            } else if (window.twttr) {
                window.twttr.widgets.load(twitterEl);
            }
        }

        // Instagram embed
        const instaEl = document.getElementById('instagram-embed');
        if (config.instagram) {
            instaEl.innerHTML = `
                <div style="margin-bottom: 8px;">
                    <a href="${config.instagram.profile_url}" target="_blank"
                       style="color: var(--accent); font-weight: 500; font-size: 14px;">
                        @${escapeHtml(config.instagram.handle)} on Instagram
                    </a>
                </div>
                <div style="color: var(--text-muted); font-size: 13px; line-height: 1.6;">
                    <p>Visit the Instagram profile directly to see latest posts.</p>
                    <a href="${config.instagram.profile_url}" target="_blank"
                       class="period-btn" style="display: inline-block; margin-top: 8px; text-decoration: none; color: var(--accent); border-color: var(--accent);">
                        Open Instagram Profile
                    </a>
                </div>
            `;
        }
    } catch (e) {
        console.error('Failed to load social embeds:', e);
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

function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

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
