# Image chạy game Đập Chuột: server Node.js nhỏ phục vụ app/ và design/.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    SITE_ROOT=/srv

WORKDIR /srv

# Server không có thư viện ngoài nên không cần npm install.
COPY --chown=node:node server/ ./server/
COPY --chown=node:node app/ ./app/
COPY --chown=node:node design/ ./design/

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/server.js"]
