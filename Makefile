.PHONY: install dev build test lint format format-check typecheck hooks-install hooks-run content-check codegen

install:
	pnpm install
	uv sync --project backend_api --group dev

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

format:
	pnpm format

format-check:
	pnpm format:check

typecheck:
	pnpm typecheck

hooks-install:
	pnpm hooks:install

hooks-run:
	pnpm hooks:run

content-check:
	pnpm content-check

PY_MODELS := backend_api/content/models

codegen:
	pnpm --filter @zero-day/content-tools codegen
	rm -rf $(PY_MODELS)
	uv run --project backend_api datamodel-codegen \
		--input content/schemas --input-file-type jsonschema --output $(PY_MODELS) \
		--output-model-type pydantic_v2.BaseModel --target-python-version 3.12 \
		--use-title-as-name --use-union-operator --use-standard-collections --field-constraints \
		--disable-timestamp --formatters builtin \
		--custom-file-header "# Generated from content/schemas by make codegen. Do not edit."
