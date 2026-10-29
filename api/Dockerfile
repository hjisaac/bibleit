FROM node:20-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

# Copy workspace and code
COPY pnpm-workspace.yaml ./
COPY engine ./engine
COPY api ./api

# Install dependencies using pnpm
RUN pnpm --filter @bibleit/engine install --prod=false
RUN pnpm --filter @bibleit/api install --prod=false
RUN pnpm --filter @bibleit/api run build

EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

CMD ["node", "api/dist/index.js"]
