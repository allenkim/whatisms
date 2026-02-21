FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ backend/
COPY frontend/ frontend/

# Create data directory for SQLite
RUN mkdir -p data

# Create non-root user and set ownership
RUN useradd --no-create-home --shell /bin/false appuser && chown -R appuser:appuser /app

EXPOSE 8050

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8050/api/status')" || exit 1

USER appuser

CMD ["python", "backend/app.py"]
