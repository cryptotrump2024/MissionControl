.PHONY: setup dev dev-full dev-bg start stop clean migrate seed seed-force test lint shell-backend agents-local

# Run with agents (full stack)
dev-full:
	docker-compose up --build

# Quick start (no rebuild)
start:
	docker-compose up

# Only backend + DB (no agents)
dev:
	docker-compose up --build backend postgres redis

# Start in background
dev-bg:
	docker-compose up --build -d

# Stop all services
stop:
	docker-compose down

# Stop and remove volumes (fresh start)
clean:
	docker-compose down -v

# Run database migrations
migrate:
	docker-compose exec backend alembic upgrade head

# Seed demo data
seed:
	docker-compose exec backend python -m scripts.seed

# Force re-seed
seed-force:
	docker-compose exec backend python -m scripts.seed --force

# Run backend tests
test-backend:
	docker-compose exec backend pytest tests/ -v

# Run frontend tests
test-frontend:
	docker-compose exec frontend npm test

# Run all tests
test: test-backend test-frontend

# Lint backend
lint-backend:
	docker-compose exec backend ruff check app/

# Lint frontend
lint-frontend:
	docker-compose exec frontend npm run lint

# View logs
logs:
	docker-compose logs -f

# View backend logs only
logs-backend:
	docker-compose logs -f backend

# Open a shell in the backend container
shell-backend:
	docker-compose exec backend bash

# Run just the agents locally (outside Docker, for development)
agents-local:
	cd agents && PYTHONPATH=.. python -m runner
