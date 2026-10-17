# bibleit command runner

default:
    @just --list

# Run frontend PWA dev server (exposed on local network)
dev:
    pnpm --prefix app dev --host

# Install frontend dependencies
install:
    pnpm --prefix app install

# Typecheck and build production bundle
build:
    pnpm --prefix app build

# Run all test suites (frontend and ingest)
test: test-app test-ingest

# Run frontend UI and component tests (Vitest)
test-app:
    pnpm --prefix app test

# Run python ingest pipeline test suite
test-ingest:
    cd ingest && uv run pytest -q
