# CollabNotes — Software Requirements Specification (SRS)

**Document status**: Approved for build
**Version**: 1.0
**Format influence**: IEEE 830 structure, adapted for a small-team build
**Related documents**: `01-PRD.md`, `03-ARCHITECTURE.md`, `04-UIUX.md`, `05-DEVELOPMENT_PLAN.md`

---

## 1. Introduction

### 1.1 Purpose
Specifies functional and non-functional requirements precisely enough to implement and test against, with no ambiguity left to the implementer. Every requirement has an ID, is independently testable, and maps to a PRD feature (§5 of the PRD).

### 1.2 Definitions & Acronyms
- **CRDT**: Conflict-free Replicated Data Type — data structure that merges concurrent edits deterministically without a central sequencer.
- **Yjs**: the CRDT library used for document state (see Architecture §3).
- **Room**: the set of WebSocket connections currently subscribed to a given document's real-time updates.
- **Update**: a binary Yjs delta representing one or more local changes, exchanged between clients/server.
- **Snapshot**: a compacted, point-in-time full state of a Yjs document, stored durably.
- **Owner / Editor / Viewer**: document-level roles, defined in §3.

### 1.3 References
- Yjs documentation: https://docs.yjs.dev
- OWASP Top 10:2025
- WCAG 2.2 (Level AA target)
- RFC 6455 (The WebSocket Protocol)

---

## 2. Overall Description

### 2.1 Product Perspective
CollabNotes is a standalone web application (not a plugin/extension to an existing product). It consists of a React SPA, a Node/Express API + WebSocket server, PostgreSQL for durable storage, and Redis for cross-instance real-time message relay. Full architecture in `03-ARCHITECTURE.md`.

### 2.2 User Classes
See §3 (Roles & Permissions) — Owner, Editor, Viewer. There is also an implicit "Unauthenticated visitor" class that can only reach the login/register screens and an "invalid or expired link" state.

### 2.3 Operating Environment
- Client: modern evergreen browsers (Chrome, Firefox, Safari, Edge — last 2 major versions). No IE11 support.
- Server: Node.js LTS, run as a directly-deployed process (see `03-ARCHITECTURE.md` §9), behind a load balancer supporting WebSocket upgrade passthrough.

### 2.4 Design & Implementation Constraints
- Must use a CRDT-based sync approach (Yjs) rather than custom Operational Transform (rationale: Architecture §2, ADR-1).
- Must not depend on AGPL/commercially-licensed components without a compatible license — this rules out `y-redis` as a direct dependency (see Architecture ADR-3); a custom Postgres+Redis persistence/relay layer is used instead.

---

## 3. User Roles & Permissions

| Capability | Owner | Editor | Viewer | Unauthenticated |
|---|:---:|:---:|:---:|:---:|
| Create document | ✅ | ✅ (their own new docs) | ❌ | ❌ |
| Edit document content | ✅ | ✅ | ❌ | ❌ |
| View document content | ✅ | ✅ | ✅ | ❌ |
| Rename document | ✅ | ❌ | ❌ | ❌ |
| Delete document | ✅ | ❌ | ❌ | ❌ |
| Manage sharing (invite/revoke) | ✅ | ❌ | ❌ | ❌ |
| View version history | ✅ | ✅ | ✅ | ❌ |
| Restore a version | ✅ | ✅ | ❌ | ❌ |
| Join real-time room | ✅ | ✅ | ✅ (read-only stream) | ❌ |

**Business rules**:
- BR-1: Every document has exactly one Owner, assigned at creation to the creating user. Ownership is not transferable in MVP.
- BR-2: A user's role on a document is stored once (`document_access` table) and is the single source of truth checked on every REST call and every WebSocket room-join — never trusted from client state.
- BR-3: Revoking access must take effect within one server round-trip for an active session (FR-14).

---

## 4. Functional Requirements

Each requirement: **ID**, statement, and Given/When/Then acceptance criteria.

### 4.1 Authentication (FR-1 to FR-6)

**FR-1**: The system shall allow registration via email + password.
- *Given* a unique email and a password meeting the policy in §7, *when* the user submits registration, *then* an account is created and a verification-free session is issued (email verification is out of scope for MVP — flagged as a known gap, not silently omitted).

**FR-2**: The system shall allow login via Google OAuth 2.0 (Authorization Code flow with PKCE).
- *Given* a user completes Google's consent screen, *when* the callback is received with a valid code, *then* an account is created (if new) or matched by email (if existing) and a session is issued.

**FR-3**: Passwords shall be hashed with bcrypt (cost factor ≥ 12) before storage; plaintext passwords are never logged or persisted.

**FR-4**: The system shall issue a short-lived JWT access token (15 minutes) and a rotating opaque refresh token (30 days) on successful login.

**FR-5**: Refresh tokens shall implement reuse detection: if a refresh token is presented twice (i.e., already rotated), the entire token family is revoked and the user is forced to re-authenticate — this indicates possible token theft.

**FR-6**: The system shall provide a logout endpoint that revokes the current refresh token family.

### 4.2 Document Management (FR-7 to FR-11)

**FR-7**: An authenticated user can create a document, which is initialized with an empty Yjs document state and becomes visible in their dashboard.

**FR-8**: An authenticated user can list all documents where they are Owner, Editor, or Viewer, sorted by `updated_at` descending by default.

**FR-9**: An Owner can rename a document (title, 1-200 chars).

**FR-10**: An Owner can delete a document. Deletion is immediate and irreversible for MVP (no soft-delete/trash) and cascades to remove all `document_access`, `document_updates`, `document_snapshots`, and `share_links` rows.

**FR-11**: Deleting a document shall force-disconnect any active WebSocket room for that document, notifying connected clients before closing.

### 4.3 Real-Time Editing (FR-12 to FR-17)

**FR-12**: Local edits shall apply to the client's in-memory Yjs document immediately, with no wait for server acknowledgment (optimistic local application is inherent to CRDT design, not an approximation).

**FR-13**: The server shall relay every incoming Yjs update to all other clients currently in the same document's room, and shall not attempt to interpret, transform, or reorder the update — merge correctness is delegated entirely to the CRDT.

**FR-14**: When a client's role is revoked or downgraded, the server shall remove that client's socket from the room within one round-trip of the access-control change, and shall reject any further update messages from that socket even if not yet disconnected (defense in depth against a race between revocation and in-flight messages).

**FR-15**: The server shall track and broadcast presence metadata (user id, display name, avatar, cursor position, selection range, assigned color) separately from document content updates (a distinct Yjs "awareness" channel, not part of the durable document state).

**FR-16**: A client that loses its WebSocket connection shall continue accepting local edits (buffered in the in-memory Yjs doc) and shall attempt reconnection with exponential backoff; on reconnect, it shall perform a Yjs state-vector exchange to sync only the delta, not the full document.

**FR-17**: A Viewer-role client shall never open a writable channel to the server; any update message received from a socket authenticated as Viewer shall be rejected and logged as a policy violation (this should not be reachable via the normal UI, but must be enforced server-side regardless).

### 4.4 Sharing & Access Control (FR-18 to FR-22)

**FR-18**: An Owner can generate a share link scoped to a role (Editor or Viewer). The link contains a cryptographically random token (≥128 bits entropy), not a predictable document ID.

**FR-19**: An Owner can invite a specific user by email with an assigned role; if the invited email has no account, access is granted pending their first login/registration with that email.

**FR-20**: An Owner can revoke a share link (invalidating it immediately) or remove a specific collaborator's access.

**FR-21**: Accessing a valid share link while unauthenticated shall redirect to login/register, then resume into the document with the link's role applied on success.

**FR-22**: Accessing a revoked or malformed share link shall show a clear "this link is no longer valid" state — never a generic 404 or 500.

### 4.5 Version History (FR-23 to FR-26)

**FR-23**: The system shall create a snapshot of a document's Yjs state (a) on a fixed interval during active editing (default: every 10 minutes of accumulated edits) and (b) whenever a restore occurs (the restore itself becomes a new snapshot entry, preserving full history).

**FR-24**: A user with Editor+ role can list snapshots for a document (timestamp, and best-effort "last editor before this point" label).

**FR-25**: A user with Editor+ role can restore a snapshot. Restoring applies the snapshot's state as a new Yjs update broadcast to the live room — it must not require other connected clients to reload the page.

**FR-26**: Viewers cannot restore a snapshot (read-only access extends to history).

---

## 5. External Interface Requirements (REST API Contract)

Base path: `/api/v1`. All authenticated requests carry `Authorization: Bearer <access_token>`. All responses are JSON. Errors follow the shape in §8.

### 5.1 Auth
```
POST /auth/register
  body: { email: string, password: string, displayName: string }
  201: { user: UserPublic, accessToken: string, refreshToken: string }
  409: EMAIL_ALREADY_EXISTS

POST /auth/login
  body: { email: string, password: string }
  200: { user: UserPublic, accessToken: string, refreshToken: string }
  401: INVALID_CREDENTIALS

POST /auth/oauth/google
  body: { code: string }
  200: { user: UserPublic, accessToken: string, refreshToken: string }

POST /auth/refresh
  body: { refreshToken: string }
  200: { accessToken: string, refreshToken: string }
  401: REFRESH_TOKEN_INVALID_OR_REUSED

POST /auth/logout
  headers: Authorization required
  204
```

### 5.2 Documents
```
GET /documents
  200: { documents: DocumentSummary[] }

POST /documents
  body: { title?: string }               // defaults to "Untitled document"
  201: { document: DocumentSummary }

GET /documents/:id
  200: { document: DocumentDetail, role: "owner"|"editor"|"viewer" }
  403: FORBIDDEN
  404: DOCUMENT_NOT_FOUND

PATCH /documents/:id
  body: { title: string }
  200: { document: DocumentSummary }
  403: FORBIDDEN   // non-owner

DELETE /documents/:id
  204
  403: FORBIDDEN   // non-owner
```

### 5.3 Sharing
```
POST /documents/:id/share/invite
  body: { email: string, role: "editor"|"viewer" }
  201: { access: DocumentAccessEntry }

POST /documents/:id/share/link
  body: { role: "editor"|"viewer" }
  201: { token: string, url: string }

DELETE /documents/:id/share/link/:token
  204

DELETE /documents/:id/access/:userId
  204

GET /documents/:id/access
  200: { collaborators: DocumentAccessEntry[] }
```

### 5.4 Version History
```
GET /documents/:id/snapshots
  200: { snapshots: SnapshotSummary[] }

POST /documents/:id/snapshots/:snapshotId/restore
  200: { document: DocumentSummary }
```

### 5.5 WebSocket
```
Upgrade request: wss://<host>/sync/:documentId?token=<accessToken>
- Server validates the JWT and checks document_access for (userId, documentId) BEFORE completing the upgrade.
- On success: client is added to the room; server sends the current Yjs state vector diff to bring the client up to date.
- Message types (binary, per y-protocols/sync + a custom envelope byte):
  0x00 = sync step 1 (state vector)
  0x01 = sync step 2 (update)
  0x02 = update (incremental)
  0x03 = awareness (presence/cursor)
```

### 5.6 Data Transfer Object Shapes
```ts
type UserPublic = { id: string; email: string; displayName: string; avatarUrl: string | null };

type DocumentSummary = { id: string; title: string; updatedAt: string; role: "owner"|"editor"|"viewer" };

type DocumentDetail = DocumentSummary & { createdAt: string; ownerId: string };

type DocumentAccessEntry = { userId: string; displayName: string; email: string; role: "editor"|"viewer"; invitedAt: string };

type SnapshotSummary = { id: string; createdAt: string; triggeredBy: "auto" | { userId: string; displayName: string } };
```

---

## 6. Data Requirements — PostgreSQL Schema (DDL)

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE NOT NULL,
  password_hash   TEXT,                     -- NULL if OAuth-only account
  display_name    TEXT NOT NULL,
  avatar_url      TEXT,
  oauth_provider  TEXT,                     -- 'google', NULL if email/password account
  oauth_uid       TEXT,                     -- provider's user id, NULL if email/password account
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oauth_provider, oauth_uid)
);
-- Note: a separate oauth_identities table (supporting one user linking multiple
-- providers) was deliberately dropped. With exactly one provider (Google) in scope,
-- two nullable columns cover the requirement without an extra join. Revisit only
-- if a second provider is ever added.

CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL,            -- shared across a rotation chain
  token_hash      TEXT NOT NULL,            -- hash of the opaque token, never store raw
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL DEFAULT 'Untitled document',
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE document_access (
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE share_links (
  token           TEXT PRIMARY KEY,          -- cryptographically random, >=128 bits
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked         BOOLEAN NOT NULL DEFAULT false
);

-- Append-only Yjs update log. Compacted periodically (see Architecture §6).
CREATE TABLE document_updates (
  id              BIGSERIAL PRIMARY KEY,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data     BYTEA NOT NULL,            -- Y.encodeStateAsUpdate() output for this delta
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_updates_doc ON document_updates(document_id, id);

-- Compacted full-state snapshots (also used for version history UI)
CREATE TABLE document_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  state_data      BYTEA NOT NULL,            -- full Y.encodeStateAsUpdate() snapshot
  triggered_by    UUID REFERENCES users(id), -- NULL = automatic
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_snapshots_doc ON document_snapshots(document_id, created_at DESC);
```

**Compaction rule (referenced by FR-23) — simplified for MVP scope**: after writing a new snapshot, older `document_updates` rows for that `document_id` are simply no longer needed for reconstructing current state. Deleting them is a valid future optimization, but is **not required for MVP**: at this project's expected data volume (a handful of documents, modest edit counts), an unbounded-but-small update log costs negligible storage and avoids a real correctness risk — a delete job racing against a still-arriving update for the same document is exactly the kind of subtle bug that isn't worth the engineering time here. If/when this is revisited, the safe pattern is to only delete rows with `id <=` the last row that was included in the snapshot, never a time-based cutoff.

---

## 7. Validation Rules

| Field | Rule |
|---|---|
| `email` | RFC 5322 basic format check; unique (case-insensitive, hence `CITEXT`) |
| `password` | ≥ 8 characters, at least 1 letter and 1 digit |
| `displayName` | 1–80 characters, trimmed |
| `document.title` | 1–200 characters; empty input defaults to "Untitled document" server-side, never rejected |
| `share role` | must be exactly `"editor"` or `"viewer"` — never `"owner"` via this endpoint |
| `share token` | server-generated only, never client-supplied |

---

## 8. Error Handling — Standard Error Envelope

All error responses share this shape:
```json
{ "error": { "code": "STRING_CODE", "message": "Human-readable, non-sensitive description" } }
```

| HTTP status | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | Request body failed schema validation |
| 401 | UNAUTHENTICATED | Missing/expired/invalid access token |
| 401 | INVALID_CREDENTIALS | Login email/password mismatch |
| 401 | REFRESH_TOKEN_INVALID_OR_REUSED | Refresh token invalid, expired, or reused (triggers family revocation) |
| 403 | FORBIDDEN | Authenticated but lacks required role for this action |
| 404 | DOCUMENT_NOT_FOUND | Document does not exist or user has zero access rows (403 vs 404 is deliberately blurred here — see note) |
| 409 | EMAIL_ALREADY_EXISTS | Registration with an existing email |
| 410 | SHARE_LINK_REVOKED | Link was valid but has been revoked |
| 429 | RATE_LIMITED | Too many requests (auth endpoints especially) |
| 500 | INTERNAL_ERROR | Unhandled server fault — message must never leak stack traces or internals |

**Note on 403 vs 404**: for `GET /documents/:id` when the requesting user has no access row at all, return 404 rather than 403 — this avoids confirming a document's existence to users who were never granted access (an OWASP A01:2025 Broken Access Control consideration).

### Edge Cases (must be explicitly handled, not just "should work")
- Two clients editing overlapping text ranges concurrently → resolved by CRDT merge automatically; no error, no user-facing conflict UI.
- Restore requested while others are actively editing → broadcast as a live update, not a forced reload.
- Role downgraded mid-session (Editor → Viewer) → in-flight edit attempts from that socket are rejected server-side (FR-17) and the client UI reflects read-only state on the next awareness/access-check tick.
- WebSocket disconnect mid-edit → local buffering + state-vector resync per FR-16; UI shows non-blocking "reconnecting" state, never a blocking modal.
- Expired/invalid/revoked share link → distinct, human-readable page state (FR-22), not a generic error page.
- Document deleted while a user has it open → all sockets in that room receive a `document_deleted` event and are gracefully disconnected with an explanatory client-side message.

---

## 9. Non-Functional Requirements

### 9.1 Performance
- NFR-1: Edit propagation latency p95 < 300ms same-instance, < 500ms cross-instance (via Redis relay).
- NFR-2: Document cold-load (existing doc, average size) to first paint < 1s on broadband.
- NFR-3: Snapshot writes must be asynchronous and must never block the real-time update path.

### 9.2 Security (mapped to OWASP Top 10:2025)
| OWASP 2025 category | How CollabNotes addresses it |
|---|---|
| A01 Broken Access Control | Every REST and WebSocket action re-checks `document_access` server-side (BR-2); no client-trusted role flags |
| A02 Security Misconfiguration | `helmet` middleware, strict CORS allowlist, no verbose error bodies in production |
| A03 Software Supply Chain Failures | Lockfile-pinned dependencies, `npm audit`/Dependabot in CI |
| A04 Cryptographic Failures | bcrypt ≥ cost 12 for passwords, TLS everywhere, JWT signed with a rotated secret, refresh tokens stored as hashes not plaintext |
| A05 Injection | Parameterized queries only (no raw string SQL concatenation) |
| A06 Insecure Design | Threat-modeled at design time: role checks are server-authoritative by construction, not bolted on |
| A07 Authentication Failures | Rate-limited auth endpoints, refresh-token reuse detection (FR-5) |
| A08 Software/Data Integrity Failures | CI runs tests before deploy; no unsigned/unverified artifact promotion |
| A09 Security Logging & Alerting Failures | Structured logs on auth failures, access-denied events, and share-link generation/revocation |
| A10 Mishandling of Exceptional Conditions | Central error-handling middleware ensures uncaught exceptions never leak internals (§8) |

*Scope note: A03 (Software Supply Chain) and A09 (Logging) rows above are satisfied by lightweight practices — running `npm audit` occasionally and using structured `console`/basic logger output — not by standing up dedicated security tooling (SCA scanners, a log aggregation stack). Don't build infrastructure for these; the practice is enough at this scale.*

### 9.3 Accessibility
- NFR-4: meet the specific WCAG 2.2 AA success criteria listed in `04-UIUX.md` §10 (keyboard operability, contrast, focus visibility, color-independent identity, labeled controls). This is a targeted subset chosen for real usability impact, not a claim of full formal AA conformance — no automated audit tooling or accessibility certification is required for MVP.

### 9.4 Availability
- NFR-5: No single point of failure in the real-time path beyond Postgres/Redis themselves (the WS/API layer is horizontally scalable per Architecture §7).

### 9.5 Testability
- NFR-6: Every functional requirement above must have at least one automated test (unit, integration, or E2E) traceable to its FR ID — see Development Plan §5 (Testing Strategy).

---

## 10. Traceability Summary
PRD feature → SRS requirement IDs:
- F1 (rich text) → FR-12
- F2 (real-time sync) → FR-12–FR-17
- F3 (presence) → FR-15
- F4 (dashboard) → FR-7–FR-11
- F5 (sharing) → FR-18–FR-22
- F6 (auth) → FR-1–FR-6
- F7 (offline resync) → FR-16
- F8 (version history) → FR-23–FR-26
