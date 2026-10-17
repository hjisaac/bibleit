.PHONY: dev build install test test-app test-ingest

SHELL := /bin/bash

# Prepend modern Node (v22 or v20 from nvm) to PATH if present
NVM_NODE_BIN := $(shell for v in v22.19.0 v22 v20.11.0 v20 v18.19.0; do [ -d "$$HOME/.nvm/versions/node/$$v/bin" ] && echo "$$HOME/.nvm/versions/node/$$v/bin" && break; done)
ifneq ($(NVM_NODE_BIN),)
  export PATH := $(NVM_NODE_BIN):$(PATH)
endif

# Run the frontend PWA dev server (exposed on local network)
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
