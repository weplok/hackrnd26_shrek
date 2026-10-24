.PHONY: install dev build test lint content-check

install:
	pnpm install
	uv sync --project services/api

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

content-check:
	pnpm content-check
