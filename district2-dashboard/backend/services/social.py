"""Social media configuration for Harvey Epstein's public accounts."""

from config import SOCIAL_MEDIA

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
        "instagram": INSTAGRAM_EMBED,
        "council_page": COUNCIL_PAGE,
    }
