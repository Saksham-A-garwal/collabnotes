# CollabNotes — Development Plan

**Document status**: Approved for build
**Version**: 1.0
**Related documents**: `01-PRD.md`, `02-SRS.md`, `03-ARCHITECTURE.md`, `04-UIUX.md`
**Total timeframe**: ~4 weeks (26 working days), solo developer

---

## 1. Working Conventions

### 1.1 Git Workflow
- `main` is always deployable.
- Feature branches: `feat/<short-desc>`, `fix/<short-desc>`, `chore/<short-desc>`.
- Commit convention: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. This keeps history readable and enables auto-generated changelogs later if desired.
- Every merged PR must reference the SRS requirement ID(s) it implements or the Phase task it closes (e.g., "Implements FR-12, FR-13").

### 1.2 Testing Strategy
| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Pure functions: validation schemas, JWT helpers, snapshot-compaction merge logic |
| Integration | Vitest + Supertest | REST endpoints against a real test Postgres instance (Dockerized in CI) |
| Realtime/CRDT correctness | Custom harness spinning up 2+ in-memory Yjs clients + a test server | Verifies FR-12/FR-13/FR-16 with a small, deliberate set of cases (concurrent overlapping edits, drop-and-reconnect mid-edit, rapid reconnect loop) — a handful of well-chosen cases, not a large automated fuzz/stress suite; that level of hardening isn't needed to demonstrate correct CRDT integration |
| E2E | Playwright | Full user flows from `01-PRD.md` §6 (create → share → collaborate → restore) across two real browser contexts simulating two users |

**Definition of Done for any feature**: implementation + at least one automated test tracing to its FR ID + no new lint/type errors + PR reviewed against the relevant SRS/Architecture section (self-review is acceptable for a solo project, but must explicitly re-read the spec, not just "looks right").

### 1.3 Pre-Merge Checklist (no CI/CD pipeline)
No automated CI/CD pipeline for this project — for a solo developer, running the same checks locally before every merge gives the same safety with none of the setup/maintenance overhead of a hosted pipeline. Before merging any feature branch to `main`:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
All four must pass locally before merge. Deployment (§ per Architecture §9) is a manual step run when a phase milestone is ready to demo — not tied to every commit.

---

## 2. Phased Roadmap

### Phase 0 — Setup (Days 1–2)
**Tasks**:
- [ ] Scaffold monorepo per Architecture §4 folder structure.
- [ ] Configure TypeScript (strict mode) across `apps/web`, `apps/api`, `packages/shared`.
- [ ] Install and configure local Postgres and Redis (directly on the dev machine, or any existing local instances) and run the initial migrations.
- [ ] Set up `.env.example` documenting required environment variables (Architecture §9).
- [ ] Implement `GET /health` endpoint.
**Definition of Done**: `npm run dev` boots both apps against local Postgres/Redis; the pre-merge checklist (§1.3) runs clean on an empty-but-structured repo; `/health` returns 200.

### Phase 1 — Auth & Document CRUD (Days 3–6)
**Tasks**:
- [ ] Postgres migrations for `users`, `oauth_identities`, `refresh_tokens`, `documents`, `document_access` (SRS §6 DDL).
- [ ] `POST /auth/register`, `POST /auth/login`, `POST /auth/oauth/google`, `POST /auth/refresh`, `POST /auth/logout` (FR-1–FR-6).
- [ ] JWT issuance + bcrypt hashing + refresh rotation with reuse detection.
- [ ] `GET/POST/PATCH/DELETE /documents` (FR-7–FR-11).
- [ ] Frontend: Login/Register screens, Dashboard with list/create/rename/delete.
**Definition of Done**: a user can register, log in (including Google OAuth), create/rename/delete a document, see it in the Dashboard; refresh-token rotation verified with an integration test that reuses an old token and confirms family revocation (FR-5).

### Phase 2 — Realtime Sync Core (Days 7–14) — highest priority, highest risk
**Tasks**:
- [ ] WebSocket server: upgrade handling, JWT verification, `document_access` check before room join (FR-14, FR-17).
- [ ] Room manager: local broadcast + Redis pub/sub publish/subscribe (Architecture §6.3).
- [ ] Sync handler implementing `y-protocols/sync` handshake.
- [ ] Awareness handler for presence/cursor data, separate channel (FR-15).
- [ ] Frontend: integrate Tiptap + `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor` with a custom WebSocket provider.
- [ ] Persistence service: append every update to `document_updates` (Architecture §6.1 step 5).
- [ ] Realtime correctness test harness (two in-memory Yjs clients + server, verifying merge correctness).
**Definition of Done**: two authenticated users editing the same document simultaneously see each other's changes and cursors within the latency target (SRS NFR-1); the small disconnect/reconnect test set (per §1.2 above) passes with zero data loss.

### Phase 3 — Persistence & Version History (Days 15–18)
**Tasks**:
- [ ] Snapshot compaction job (interval-based, Architecture §6.2).
- [ ] `GET /documents/:id/snapshots`, `POST /documents/:id/snapshots/:id/restore` (FR-23–FR-26).
- [ ] Restore broadcasts as a live update to connected clients, not a forced reload.
- [ ] Frontend: History panel UI (per UIUX §3.5) with restore + confirm flow.
**Definition of Done**: closing and reopening a document (including after a server restart) restores exact last-saved state; restoring a snapshot correctly propagates live to a second connected client without requiring their page refresh.

### Phase 4 — Sharing & Permissions (Days 19–21)
**Tasks**:
- [ ] `document_access`, `share_links` tables + endpoints (FR-18–FR-22).
- [ ] Role enforcement at both REST (`FORBIDDEN`/`DOCUMENT_NOT_FOUND` per SRS §8) and WebSocket layers (FR-17).
- [ ] Frontend: Share Modal (UIUX §3.4), role-based toolbar disabling for Viewers.
- [ ] Revocation disconnects active sessions within one round-trip (FR-14) — test explicitly.
**Definition of Done**: a Viewer cannot send edits even via a manually crafted WebSocket message (server-side rejection verified by test, not just hidden UI); revoking access mid-session disconnects that user from the room; invalid/revoked share links show the dedicated error state (FR-22, UIUX §8).

### Phase 5 — Polish, Accessibility, Deployment (Days 22–26)
**Tasks**:
- [ ] Edge-case pass: all rows in SRS §8 "Edge Cases" verified with explicit tests.
- [ ] Responsive pass (UIUX §9) across the three breakpoint behaviors.
- [ ] Accessibility pass against the checklist in UIUX §10 — manual keyboard-nav walkthrough and visual contrast check are sufficient; no automated scanning tooling needed.
- [ ] Playwright E2E suite covering the four flows in UIUX §4.
- [ ] Deploy the built app (per Architecture §9) to the chosen host, confirm `/health` reachable publicly.
- [ ] Write README: architecture rationale (CRDT choice, Redis scaling design, why not `y-redis` — this is genuinely good interview material, don't skip it), setup instructions, and a link to these five spec documents.
**Definition of Done**: PRD §12 release gate is met — all Must features pass their acceptance criteria, all PRD §8 success metrics are verified, no open Critical/High severity bug in sync or auth paths, deployed and publicly reachable.

---

## 3. Milestones Summary

| Day | Milestone |
|---|---|
| 2 | Local dev environment fully operational (Phase 0 DoD) |
| 6 | Auth + document CRUD complete and deployed to a staging environment |
| 14 | **Critical milestone**: real-time collaborative editing verified correct under concurrent load and disconnect testing |
| 18 | Version history functional |
| 21 | Sharing/permissions enforced end-to-end, including at the WebSocket layer |
| 26 | MVP feature-complete, tested, deployed, documented |

## 4. Dependency Graph
```
Phase 0 (setup)
   └── Phase 1 (auth + CRUD)
          └── Phase 2 (realtime sync)   ← the load-bearing phase; nothing after this is meaningful until it's solid
                 ├── Phase 3 (persistence/history)
                 └── Phase 4 (sharing/permissions)
                        └── Phase 5 (polish + deploy)
```
Phases 3 and 4 both depend on Phase 2 but not on each other — they can be reordered or interleaved if needed without breaking the plan.

## 5. Overall MVP Definition of Done
Restated from PRD §12 for build-time reference: all "Must" features implemented and tested; all PRD §8 metrics met; deployed and publicly reachable; README documents the architecture decisions for anyone (including future-you in an interview) evaluating the system's engineering quality.
