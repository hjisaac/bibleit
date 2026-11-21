#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   SERV00_HOST=s1.serv00.com SERV00_USER=myuser SERV00_DOMAIN=bibleit.serv00.net ./api/scripts/deploy-serv00.sh

: "${SERV00_HOST:?Set SERV00_HOST (e.g. s1.serv00.com)}"
: "${SERV00_USER:?Set SERV00_USER (your Serv00 login)}"
: "${SERV00_DOMAIN:?Set SERV00_DOMAIN (e.g. bibleit.serv00.net)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGE_DIR="$(mktemp -d)"
REMOTE_DIR="domains/${SERV00_DOMAIN}/public_nodejs"

trap 'rm -rf "$STAGE_DIR"' EXIT

echo "1/4 Building @bibleit/api bundle..."
pnpm --dir "$REPO_ROOT" --filter @bibleit/api build

echo "2/4 Staging minimal runtime package..."
mkdir -p "$STAGE_DIR/dist"
cp "$REPO_ROOT/api/dist/index.js" "$STAGE_DIR/dist/index.js"

# Serv00 Phusion Passenger expects app.js at the root of public_nodejs/.
cat > "$STAGE_DIR/app.js" <<'EOF'
import './dist/index.js';
EOF

# Strip workspace:* (@bibleit/engine is already bundled into dist/index.js by esbuild).
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$REPO_ROOT/api/package.json', 'utf8'));
  delete pkg.dependencies['@bibleit/engine'];
  const out = {
    name: pkg.name,
    version: pkg.version,
    private: true,
    type: 'module',
    scripts: { start: 'node app.js' },
    dependencies: pkg.dependencies,
  };
  fs.writeFileSync('$STAGE_DIR/package.json', JSON.stringify(out, null, 2));
"

echo "3/4 Syncing bundle to ${SERV00_USER}@${SERV00_HOST}:${REMOTE_DIR}..."
rsync -avz --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  "$STAGE_DIR/" "${SERV00_USER}@${SERV00_HOST}:${REMOTE_DIR}/"

echo "4/4 Installing production deps (--ignore-scripts for FreeBSD) & restarting..."
ssh "${SERV00_USER}@${SERV00_HOST}" bash -s <<EOF
  set -euo pipefail
  cd ~/${REMOTE_DIR}
  npm install --omit=dev --ignore-scripts
  devil www restart ${SERV00_DOMAIN}
EOF

echo "Done! Verify: curl -i https://${SERV00_DOMAIN}/health"
