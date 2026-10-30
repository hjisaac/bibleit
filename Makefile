.PHONY: dev dev-front dev-back install install-front install-back build build-front build-back test test-front test-back test-ingest test-e2e

SHELL := /bin/bash

# Prepend modern Node (v22 or v20 from nvm) to PATH if present
NVM_NODE_BIN := $(shell for v in v22.19.0 v22 v20.11.0 v20 v18.19.0; do [ -d "$$HOME/.nvm/versions/node/$$v/bin" ] && echo "$$HOME/.nvm/versions/node/$$v/bin" && break; done)
ifneq ($(NVM_NODE_BIN),)
  export PATH := $(NVM_NODE_BIN):$(PATH)
endif

# Development
dev: dev-front

dev-front:
	pnpm --prefix app dev --host

dev-back:
	pnpm --filter @bibleit/api dev

# Dependencies
install:
	pnpm install

install-front:
	pnpm --prefix app install

install-back:
	pnpm --filter @bibleit/api install

# Production builds
build: build-front build-back

build-front:
	pnpm --prefix app build

build-back:
	pnpm --filter @bibleit/api build

# Testing
test: test-front test-back test-ingest

test-front:
	pnpm --prefix app test

test-back:
	pnpm --filter @bibleit/api build

test-ingest:
	cd ingest && uv run pytest -q

test-e2e:
	pnpm --prefix app test:e2e
