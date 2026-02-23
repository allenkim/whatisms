FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git docker.io docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI (assumes it's available on PATH or mounted)
# The worker expects 'claude' to be available via CLAUDE_PATH env var

WORKDIR /app
COPY suggestions_worker.py .

RUN useradd --no-create-home --shell /bin/false worker

USER worker

CMD ["python", "suggestions_worker.py"]
