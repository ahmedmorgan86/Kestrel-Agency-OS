FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json bun.lock ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build \
  && mkdir -p /var/lib/morgan-group/data /var/lib/morgan-group/storage \
  && chown -R node:node /app /var/lib/morgan-group

ENV SQLITE_DB_PATH=/var/lib/morgan-group/data/morgan-group.sqlite \
    STORAGE_ROOT_DIR=/var/lib/morgan-group/storage \
    PORT=3000

USER node
EXPOSE 3000
CMD ["npm", "run", "start:production"]
