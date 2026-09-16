# CollabNotes

Real-time collaborative rich-text editor — Yjs CRDT sync, Tiptap editor, Node/Express + WebSocket API, PostgreSQL, Redis pub/sub relay.

Full specs: [`docs/01-PRD.md`](docs/01-PRD.md) · [`docs/02-SRS.md`](docs/02-SRS.md) · [`docs/03-ARCHITECTURE.md`](docs/03-ARCHITECTURE.md) · [`docs/04-UIUX.md`](docs/04-UIUX.md) · [`docs/05-DEVELOPMENT_PLAN.md`](docs/05-DEVELOPMENT_PLAN.md)

## Stack
React + TypeScript + Tiptap (frontend) · Express + `ws` + Yjs (API/realtime) · PostgreSQL (durable storage) · Redis (cross-instance relay).

## Getting started

1. Copy `.env.example` to `.env` and fill in values (a local Postgres + Redis are required — see below).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run migrations:
   ```bash
   npm run migrate
   ```
4. Start both apps in dev mode:
   ```bash
   npm run dev
   ```
   API on `http://localhost:4000`, web on `http://localhost:5173`.

### Local Postgres & Redis
No containerization is required to develop (Architecture §9) — point `DATABASE_URL`/`REDIS_URL` at any local or existing instance. A quick way to get both running via Docker without adopting Docker for the whole project:
```bash
docker run -d --name collabnotes-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=collabnotes -p 5432:5432 postgres:16
docker run -d --name collabnotes-redis -p 6379:6379 redis:7
```

## Pre-merge checklist
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Project layout
```
apps/web       React SPA (Vite)
apps/api       Express API + WebSocket sync server
packages/shared  DTOs and constants shared by both apps
```

## Build status
Following the phased plan in `docs/05-DEVELOPMENT_PLAN.md`:
- [x] Phase 0 — repo scaffold, TypeScript config, migrations, `/health`
- [ ] Phase 1 — auth & document CRUD
- [ ] Phase 2 — realtime sync core
- [ ] Phase 3 — persistence & version history
- [ ] Phase 4 — sharing & permissions
- [ ] Phase 5 — polish, accessibility, deployment
