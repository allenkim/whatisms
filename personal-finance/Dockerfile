FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
RUN mkdir -p /app/data

RUN useradd --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:3000/finance',(r)=>r.statusCode===200?process.exit(0):process.exit(1)).on('error',()=>process.exit(1))"

USER appuser

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
