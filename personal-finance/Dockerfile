# ── Builder stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Copy standalone build output + required assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/data

RUN useradd --no-create-home --shell /bin/false appuser \
    && chown -R appuser:appuser /app

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "const http=require('http');http.get('http://localhost:3000/finance',(r)=>r.statusCode===200?process.exit(0):process.exit(1)).on('error',()=>process.exit(1))"

USER appuser

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
