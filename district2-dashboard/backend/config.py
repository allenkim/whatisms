import os

# District 2 configuration
COUNCIL_DISTRICT = 2
COUNCIL_MEMBER = "Harvey Epstein"
DISTRICT_NEIGHBORHOODS = [
    "Lower East Side", "East Village", "Greenwich Village",
    "NoHo", "Gramercy", "Kips Bay", "Murray Hill",
    "Stuyvesant Town", "Peter Cooper Village", "Alphabet City",
]

# District 2 approximate ZIP codes (used for HPD violation filtering)
DISTRICT_ZIPS = ["10002", "10003", "10009", "10010", "10016", "10017", "10012"]

# NYC Open Data (Socrata SODA API)
NYC_OPENDATA_BASE = "https://data.cityofnewyork.us/resource"
NYC_OPENDATA_APP_TOKEN = os.environ.get("NYC_OPENDATA_APP_TOKEN", "")

# Dataset IDs
DATASETS = {
    "fdny_incidents": "8m42-w767",
    "nypd_complaints_ytd": "5uac-w243",
    "nypd_complaints_historic": "qgea-i56i",
    "nypd_calls_ytd": "n2zq-pubd",
    "nypd_calls_historic": "d6zx-ckhd",
    "311_requests": "erm2-nwe9",
    "hpd_violations": "csn4-vhvf",
    "hpd_complaints": "ygpa-z7cr",
    "hpd_registrations": "tesw-yqqr",
    "hpd_contacts": "feu5-w2e2",
    "hpd_buildings": "kj4p-ruqc",
    "council_districts_geo": "yusd-j4xi",
}

# Google News RSS for District 2 and Harvey Epstein
NEWS_FEEDS = {
    "district2_news": (
        "https://news.google.com/rss/search?q="
        "%22District+2%22+%22City+Council%22+NYC"
        "&hl=en-US&gl=US&ceid=US:en"
    ),
    "epstein_news": (
        "https://news.google.com/rss/search?q="
        "%22Harvey+Epstein%22+%22Council+Member%22+NYC"
        "+-Weinstein+-Jeffrey+-trafficking"
        "&hl=en-US&gl=US&ceid=US:en"
    ),
    "epstein_news_alt": (
        "https://news.google.com/rss/search?q="
        "%22Harvey+Epstein%22+%22District+2%22+NYC"
        "+-Weinstein+-Jeffrey"
        "&hl=en-US&gl=US&ceid=US:en"
    ),
    "neighborhood_news": (
        "https://news.google.com/rss/search?q="
        "(%22Lower+East+Side%22+OR+%22East+Village%22)+NYC+"
        "(fire+OR+crime+OR+shooting+OR+stabbing+OR+protest+OR+council)"
        "&hl=en-US&gl=US&ceid=US:en"
    ),
}

# Social media
SOCIAL_MEDIA = {
    "twitter_handle": "HarveyforNY",
    "instagram_handle": "harveyforny",
    "council_page": "https://council.nyc.gov/district-2/",
}

# NYC Council Legistar API
LEGISTAR_BASE = "https://webapi.legistar.com/v1/nyc"

# Server
HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8050"))

# Data
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "district2.db")
BACKFILL_MONTHS = int(os.environ.get("BACKFILL_MONTHS", "12"))

# Scheduler intervals (in minutes)
SCHEDULE = {
    "fdny": 15,
    "nypd": 30,
    "311": 15,
    "news": 30,
    "hpd": 360,       # 6 hours
    "legistar": 360,   # 6 hours
    "aggregate": 1440,  # 24 hours (nightly)
}

# Socrata API limits
SOCRATA_PAGE_SIZE = 5000
SOCRATA_HEADERS = {}
if NYC_OPENDATA_APP_TOKEN:
    SOCRATA_HEADERS["X-App-Token"] = NYC_OPENDATA_APP_TOKEN
