FROM node:20-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Copy workspace, engine, api, and data artifacts (only 3.3 MB)
COPY pnpm-workspace.yaml ./
COPY engine ./engine
COPY api ./api
COPY app/public/data ./data

# Install dependencies using pnpm
RUN pnpm --filter @bibleit/engine install --prod=false
RUN pnpm --filter @bibleit/api install --prod=false
RUN pnpm --filter @bibleit/api run build

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["pnpm", "--filter", "@bibleit/api", "start"]
