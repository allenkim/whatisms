"""Social media configuration for Harvey Epstein's public accounts."""

from config import SOCIAL_MEDIA

# Social media embed configuration
# These are rendered client-side using official embed widgets

TWITTER_EMBED = {
    "handle": SOCIAL_MEDIA["twitter_handle"],
    "timeline_url": f"https://twitter.com/{SOCIAL_MEDIA['twitter_handle']}",
    "widget_html": (
        f'<a class="twitter-timeline" '
        f'href="https://twitter.com/{SOCIAL_MEDIA["twitter_handle"]}" '
        f'data-height="600" data-theme="light" data-chrome="noheader nofooter">'
        f'Tweets by @{SOCIAL_MEDIA["twitter_handle"]}</a>'
    ),
    "script": "https://platform.twitter.com/widgets.js",
}

INSTAGRAM_EMBED = {
    "handle": SOCIAL_MEDIA["instagram_handle"],
    "profile_url": f"https://www.instagram.com/{SOCIAL_MEDIA['instagram_handle']}/",
}

COUNCIL_PAGE = {
    "url": SOCIAL_MEDIA["council_page"],
    "title": "NYC Council - District 2",
}


def get_social_config() -> dict:
    """Return social media embed configuration for the frontend."""
    return {
        "twitter": TWITTER_EMBED,
        "instagram": INSTAGRAM_EMBED,
        "council_page": COUNCIL_PAGE,
    }
