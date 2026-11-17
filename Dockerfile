# Image chạy game Đập Chuột: server Node.js phục vụ app/, design/ và API (PostgreSQL).
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    SITE_ROOT=/srv

WORKDIR /srv

# Cài thư viện trước để Docker cache lại khi chỉ sửa code.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server/ ./server/
COPY --chown=node:node app/ ./app/
COPY --chown=node:node design/ ./design/

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/server.js"]
