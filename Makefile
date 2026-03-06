.PHONY: setup dev stop clean migrate seed test lint

# Start everything
dev:
	docker-compose up --build

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

# Start agents (run after backend is up)
agents:
	docker-compose exec backend python -m agents.runner
