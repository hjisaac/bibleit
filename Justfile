set shell := ["bash", "-c"]

# Prepend modern Node (v22 or v20 from nvm) to PATH if present
nvm_node_bin := `for v in v22.19.0 v22 v20.11.0 v20 v18.19.0; do [ -d "$HOME/.nvm/versions/node/$v/bin" ] && echo "$HOME/.nvm/versions/node/$v/bin" && break; done`
export PATH := if nvm_node_bin != "" { nvm_node_bin + ":" + env_var('PATH') } else { env_var('PATH') }

default:
    @just --list

# --- Development ---
dev: dev-front

# Run frontend PWA dev server (exposed on local network)
dev-front:
    pnpm --prefix app dev --host

# Run backend search API dev server
dev-back:
    pnpm --filter @bibleit/api dev

# --- Dependencies ---
# Install all workspace dependencies
install:
    pnpm install

# Install frontend dependencies
install-front:
    pnpm --prefix app install

# Install backend dependencies
install-back:
    pnpm --filter @bibleit/api install

# --- Production Builds ---
# Build both frontend and backend
build: build-front build-back

# Typecheck and build production bundle
build-front:
    pnpm --prefix app build

# Build backend API
build-back:
    pnpm --filter @bibleit/api build

# --- Testing ---
# Run all test suites
test: test-front test-back test-ingest

# Run frontend UI and component tests (Vitest)
test-front:
    pnpm --prefix app test

# Typecheck backend API
test-back:
    pnpm --filter @bibleit/api build

# Run frontend end-to-end tests (Playwright)
test-e2e:
    pnpm --prefix app test:e2e

# Run python ingest pipeline test suite
test-ingest:
    cd ingest && uv run pytest -q
