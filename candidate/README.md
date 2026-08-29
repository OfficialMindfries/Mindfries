# candidate/

The candidate-facing app: [`backend/`](backend) (FastAPI) and [`frontend/`](frontend) (Next.js), each containerized and wired together with Docker Compose.

## Run with Docker

1. Copy the env templates and fill in real values:
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.local.example frontend/.env.local
   ```
2. Build and start both services:
   ```bash
   docker compose up --build
   ```
3. Open:
   - Frontend: http://localhost:3000
   - Backend API docs: http://localhost:8000/docs

Stop with `docker compose down` (add `-v` to also drop any anonymous volumes).

## Run individually

Each app also has its own Dockerfile if you only need one:

```bash
docker build -t mindfries-backend ./backend
docker run --env-file ./backend/.env -p 8000:8000 mindfries-backend

docker build -t mindfries-frontend ./frontend
docker run --env-file ./frontend/.env.local -p 3000:3000 mindfries-frontend
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for running without Docker (venv / `npm run dev`).
