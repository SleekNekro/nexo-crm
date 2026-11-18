FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/SleekNekro/nexo-crm"
WORKDIR /gateway
COPY server.mjs ./server.mjs
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "/gateway/server.mjs"]
