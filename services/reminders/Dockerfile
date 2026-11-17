FROM node:22-bookworm-slim
WORKDIR /reminders
COPY worker.mjs ./worker.mjs
USER node
CMD ["node","worker.mjs"]
