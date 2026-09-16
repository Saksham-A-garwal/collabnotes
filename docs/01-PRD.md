# CollabNotes — Product Requirements Document (PRD)

**Document status**: Approved for build
**Version**: 1.0
**Related documents**: `02-SRS.md`, `03-ARCHITECTURE.md`, `04-UIUX.md`, `05-DEVELOPMENT_PLAN.md`

---

## 1. Purpose of This Document
Defines *what* CollabNotes is and *why* it's being built, at a product level — not implementation detail. Implementation detail lives in the SRS and Architecture docs. Any requirement change must be reflected here first, then cascaded to the other four documents.

## 2. Problem Statement
Teams and individuals who co-write text documents today rely on either (a) turn-based file sharing (email attachments, shared drives with lock-based editing), which creates version conflicts and stale-copy confusion, or (b) third-party SaaS tools (Google Docs, Notion) which is fine for end users but gives no visibility or control to a team that wants to self-host or understand the underlying mechanics. CollabNotes solves the *editing experience* problem: real-time, conflict-free, multi-user text editing with no manual merge step, deployable as a self-contained system.

## 3. Target Users & Personas

| Persona | Description | Primary need |
|---|---|---|
| **Individual writer** | Drafts notes/specs solo most of the time, occasionally shares for review | Fast, frictionless doc creation; simple sharing |
| **Small team co-writer** | 2-5 people actively editing the same document in a working session | Zero-conflict simultaneous editing, visible presence |
| **Reviewer / Viewer** | Invited to read and comment on a document, not edit it | Reliable read-only access, clarity on their permission level |
| **Technical evaluator** *(secondary, drives some non-functional requirements)* | Assesses the system's engineering quality | Correct CRDT merge behavior, sane architecture, defensible security posture |

## 4. Goals & Non-Goals

### 4.1 Goals
- G1: Enable 2+ users to edit one document simultaneously with correct, lossless merging.
- G2: Make the collaborative state feel instantaneous and reliable (no visible lag, no unexplained reverts).
- G3: Make documents durable — survive client crashes, server restarts, and network partitions without data loss.
- G4: Provide simple, safe sharing with clear permission boundaries.
- G5: Ship a system whose architecture is legitimately production-grade in pattern, even if the deployment scale is small.

### 4.2 Non-Goals (see also §10 Out of Scope)
- NG1: This is not a full workspace/knowledge-base product (no folders, no nested wikis).
- NG2: This is not targeting real-time co-authoring of non-text content (spreadsheets, diagrams, drawings).
- NG3: This does not target enterprise compliance certification (SOC2, HIPAA, etc.).

## 5. Core Features (MVP)

| # | Feature | Priority (MoSCoW) |
|---|---|---|
| F1 | Rich-text editor (bold, italic, underline, headings H1-H3, bullet/numbered lists, links) | Must |
| F2 | Real-time multi-user sync with CRDT merge | Must |
| F3 | Live presence: collaborator avatars + colored cursors/selections | Must |
| F4 | Document dashboard: create, list, rename, delete | Must |
| F5 | Sharing via email invite or link, with Editor/Viewer roles | Must |
| F6 | Auth: email/password + Google OAuth | Must |
| F7 | Offline edit buffering + automatic resync | Must |
| F8 | Version history with restore | Should |
| F9 | Dark mode | Could |
| F10 | Comment threads | Won't (this release) |
| F11 | Export to PDF/DOCX | Won't (this release) |

*(F9 "activity indicator" from the original draft was cut — it's fully covered by F3 presence avatars/cursors and would have been a duplicate feature, not a new one.)*

## 6. User Stories (with acceptance criteria)

**US-1**: As a registered user, I can create a new document so I can begin writing.
- *Given* I am logged in, *when* I click "New document", *then* a blank document opens with an editable title and empty body within 1 second.

**US-2**: As a document Owner, I can invite a collaborator by email with a specific role.
- *Given* I own a document, *when* I enter a valid email and select "Editor", *then* that user gains edit access on their next login, and receives a notification/link (email delivery mechanism detailed in SRS).

**US-3**: As an Editor, I see other editors' cursors and selections live.
- *Given* two Editors have the same document open, *when* one moves their cursor or selects text, *then* the other sees the change reflected within 300ms (p95), labeled with the editing user's name/color.

**US-4**: As a user, my edits are never lost even if my connection drops.
- *Given* I am editing with an active local session, *when* my WebSocket connection drops, *then* my further keystrokes are still applied to my local document state, and *when* connectivity resumes, *then* all buffered changes merge into the shared document with no loss and no duplication.

**US-5**: As a Viewer, I cannot modify content, and the UI reflects this clearly.
- *Given* my role on a document is Viewer, *when* I open it, *then* the formatting toolbar is disabled/hidden and any attempted keystroke has no effect on the document.

**US-6**: As an Owner, I can revoke a collaborator's access at any time.
- *Given* I remove a collaborator's access, *when* they have an active session open on that document, *then* their session is disconnected from the document's real-time room within one round trip, and they can no longer reopen it.

**US-7**: As a user, I can view and restore a previous version of a document.
- *Given* a document has at least one snapshot, *when* I open version history and select "Restore", *then* the document content reverts to that snapshot's state for all currently connected users without requiring them to refresh.

## 7. MVP Scope Boundary
See `05-DEVELOPMENT_PLAN.md` §2 for the phased build order. The MVP is complete when every "Must" item in §5 is implemented and passes its acceptance criteria in §6, deployed and reachable via a public URL.

## 8. Success Metrics

| Metric | Target | Measurement method |
|---|---|---|
| Edit propagation latency (p95) | < 300ms same-instance, < 500ms cross-instance | Server-side timestamp diff on relayed updates (logged, not user-facing) |
| Data-loss incidents in disconnect/reconnect testing | 0 in 100 simulated cycles | Automated test harness (see SRS §9, Architecture §8) |
| Time from landing page to first live-shared edit | < 60 seconds | Manual UX timing / can be scripted with Playwright |
| Concurrent editors supported per document (MVP target) | 4–5 simultaneous editors with no visible lag | Manual testing across multiple browser sessions/devices — no dedicated load-test infrastructure needed at this scale |

## 9. Assumptions
- A1: Single-region deployment is acceptable; no multi-region active-active requirement.
- A2: Document content is rich text only — no embedded spreadsheets/canvases/media beyond simple links.
- A3: Per-document concurrent editor count stays in the tens, not thousands.
- A4: Portfolio/demo context — enterprise compliance (SOC2, audit trail export, SSO/SAML) is explicitly not required.
- A5: English-only UI for MVP; i18n is future work.

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| CRDT/editor integration bugs cause silent merge corruption | High | Medium | Use battle-tested Yjs + Tiptap binding rather than custom OT; add automated multi-client merge tests (SRS §9) |
| WebSocket scaling across instances mishandled | High | Medium | Design Redis pub/sub relay from Phase 2, not retrofitted later (see Architecture §7) |
| Scope creep toward "clone all of Google Docs" | Medium | High | Hard MVP cut in §5/§7; anything not listed as Must/Should is explicitly Won't |
| Share-link security (guessable tokens, no revocation) | High | Low | Cryptographically random tokens, explicit revocation flow (SRS §5) |

## 11. Out of Scope (this release)
- Comment threads / suggestion mode
- Paragraph/block-level granular permissions
- Organizations, workspaces, nested folders
- Native mobile apps
- Export to PDF/DOCX
- Full offline-first PWA (basic reconnect-resync only)
- Real-time voice/video
- Multi-region deployment
- SSO/SAML, audit log export, compliance certifications

## 12. PRD-Level Acceptance Criteria (release gate)
The product is releasable when:
1. All "Must" features in §5 are implemented and their user stories in §6 pass.
2. All success metrics in §8 are met under the stated test conditions.
3. No open Critical or High severity bug exists in the sync or auth paths (see SRS §9 for severity definitions).
