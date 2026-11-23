# Build from repository root: docker build -f worker/Dockerfile .
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/package.json ./worker/package.json
RUN cd worker && npm install --omit=dev --no-audit --no-fund
COPY worker/index.mjs ./worker/index.mjs
COPY server/knowledge-large-media.js ./server/knowledge-large-media.js
COPY server/knowledge-transcription.js ./server/knowledge-transcription.js
COPY server/large-media-worker.mjs ./server/large-media-worker.mjs
USER node
WORKDIR /app/worker
CMD ["node","index.mjs"]
