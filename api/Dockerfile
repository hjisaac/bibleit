FROM node:20-slim

WORKDIR /app

# Enable pnpm and skip unused CUDA GPU binaries for CPU deployment
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate
ENV ONNXRUNTIME_NODE_INSTALL=skip

# Copy workspace, engine, api, and data artifacts (only 3.3 MB)
COPY pnpm-workspace.yaml ./
COPY engine ./engine
COPY api ./api
COPY app/public/data ./data

# Install dependencies and compile api
RUN pnpm --filter @bibleit/engine install --prod=false && \
    pnpm --filter @bibleit/api install --prod=false && \
    pnpm --filter @bibleit/api run build

# Pre-download neural embedding model into image cache for instant cold starts
ENV HF_HOME=/app/.cache/huggingface
RUN node api/scripts/download-model.mjs

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV NODE_OPTIONS="--max-old-space-size=256"

CMD ["pnpm", "--filter", "@bibleit/api", "start"]
