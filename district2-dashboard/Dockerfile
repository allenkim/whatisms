FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ backend/
COPY frontend/ frontend/

# Create data directory for SQLite (will be mounted as a Fly Volume)
RUN mkdir -p data

EXPOSE 8050

CMD ["python", "backend/app.py"]
