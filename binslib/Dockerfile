FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Python 3 + pip for epub-converter and meta-puller (runtime dependencies)
# better-sqlite3 native build tools
RUN apk add --no-cache python3 py3-pip make g++ \
    && pip3 install --break-system-packages ebooklib rich Pillow httpx

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
