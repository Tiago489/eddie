.PHONY: dev prod prod-build down down-dev logs logs-api logs-worker ps migrate test key

# Development
dev:
	docker compose up -d
	pnpm dev

# Production
prod:
	docker compose -f docker-compose.prod.yml up -d

prod-build:
	docker compose -f docker-compose.prod.yml build

down:
	docker compose -f docker-compose.prod.yml down

down-dev:
	docker compose down

# Logs
logs:
	docker compose -f docker-compose.prod.yml logs -f

logs-api:
	docker compose -f docker-compose.prod.yml logs -f api

logs-worker:
	docker compose -f docker-compose.prod.yml logs -f worker

# Status
ps:
	docker compose -f docker-compose.prod.yml ps

# Database
migrate:
	docker compose -f docker-compose.prod.yml run --rm migrate

# Testing
test:
	pnpm test

# Generate encryption key
key:
	pnpm generate:key
