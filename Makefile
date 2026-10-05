.PHONY: dev build install test

# Run the frontend PWA dev server
dev:
	pnpm --prefix app dev

# Install frontend dependencies
install:
	pnpm --prefix app install

# Typecheck and build production bundle
build:
	pnpm --prefix app build

# Run python ingest tests
test:
	pytest ingest/tests
