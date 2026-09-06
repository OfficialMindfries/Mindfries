# Internal Admin

Mindfries-team ops portal. Mirrors the `candidate/` layout:

- `frontend/` — Next.js 16 app (admin portal + Lead Tracker). The Tracker's
  server logic (daily discovery cron, outbound email, webhooks, Supabase access)
  currently lives in the Next route handlers here.
- `backend/` — FastAPI service (the "Admin API" from the PRD). Not built yet;
  when it lands, the tracker's server code moves here behind the same data shapes.

## Run the frontend
```bash
cd frontend
npm install
npm run dev
```

Go-live / env setup: see [`frontend/TRACKER_SETUP.md`](frontend/TRACKER_SETUP.md).
