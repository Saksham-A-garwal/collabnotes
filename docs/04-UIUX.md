# CollabNotes — UI/UX Document

**Document status**: Approved for build
**Version**: 1.0
**Related documents**: `01-PRD.md`, `02-SRS.md`, `03-ARCHITECTURE.md`, `05-DEVELOPMENT_PLAN.md`

---

## 1. Design Principles
1. **Invisible infrastructure** — sync, saving, and merging must never surface as user-facing concepts. No "conflict" dialogs, no manual save button.
2. **Familiar over novel** — the editor should look and behave like tools people already know; the innovation is the sync engine, not the chrome around it.
3. **Calm presence** — collaborator cursors/avatars inform without distracting; no attention-grabbing animation on every keystroke.
4. **Fail visibly, recover invisibly** — connection issues get a small, honest indicator; recovery happens automatically without user action.

## 2. Design Tokens

### 2.1 Typography
| Token | Value | Usage |
|---|---|---|
| `font-ui` | Inter, system-ui, sans-serif | All chrome: nav, buttons, labels |
| `font-doc` | "Source Serif 4", Georgia, serif | Document body content only |
| `text-xs` | 12px / 1.4 | Timestamps, helper text |
| `text-sm` | 14px / 1.5 | Body UI text, toolbar labels |
| `text-base` | 16px / 1.6 | Default |
| `text-lg` | 20px / 1.4 | Document title |
| `doc-body` | 18px / 1.7 | Editor content — generous line-height for long reading/editing sessions |

### 2.2 Color
| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg-canvas` | #FFFFFF | #1A1A1A | Document canvas background |
| `bg-chrome` | #F7F7F5 | #232323 | Toolbar, sidebar |
| `text-primary` | #1A1A1A | #F0F0EE | Main text |
| `text-secondary` | #6B6B68 | #A0A09C | Muted labels |
| `accent` | #3D6FE0 | #6D93F0 | Primary buttons, links |
| `danger` | #D0392C | #E5645A | Destructive actions (delete, revoke) |

**Collaborator cursor palette** (assigned round-robin per session, never user-chosen): 8 fixed, WCAG-AA-contrast-checked hues — e.g. `#E0573D` `#3D8BE0` `#3DAE5C` `#B23DE0` `#E0A73D` `#3DBEB8` `#E03D8F` `#7A8C3D`. Each is paired with the collaborator's initials in an avatar chip, never relying on color alone (accessibility requirement, §10).

### 2.3 Spacing & Radius
| Token | Value |
|---|---|
| `space-xs/sm/md/lg/xl` | 4 / 8 / 16 / 24 / 40 px |
| `radius-control` | 8px (buttons, inputs) |
| `radius-card` | 12px (modals, cards) |

## 3. Screen Inventory

### 3.1 Login / Register
- Fields: email, password (with visibility toggle), submit button.
- "Continue with Google" button, visually secondary to the primary email flow but equally prominent in placement (not buried).
- Inline validation appears on blur, not only on submit (reduces failed-submit frustration).
- Toggle link between Login and Register modes on the same screen.

### 3.2 Dashboard
- Header: app logo/name, user avatar menu (top-right, contains "Log out").
- Primary action: "New document" button, top-left, always visible.
- Document grid/list: each item shows title, last-edited relative time, and small avatar stack of collaborators.
- Empty state (no documents yet): centered illustration-free message — "Create your first document" with the New document button restated inline.
- Search/filter input above the grid, filters by title client-side (no need for server search at this scale).

### 3.3 Editor
- **Top bar**: document title (inline-editable text, click to edit, auto-saves on blur), presence avatar stack (top-right), "Share" button, connection-status indicator (small dot: green=synced, amber=reconnecting).
- **Toolbar** (below top bar): bold, italic, underline, heading dropdown (Normal/H1/H2/H3), bullet list, numbered list, link. Disabled/hidden entirely for Viewer role.
- **Canvas**: the Tiptap editor surface, centered, max-width ~720px for readability (matches "page" metaphor), using `font-doc`/`doc-body` tokens.
- **Version history** access: a small "History" icon/button in the top bar opens the history panel as a right-side slide-over (not a route change — keeps editing context alive underneath).

### 3.4 Share Modal
- Two sections: "Invite by email" (email input + role dropdown + Send button) and "Share link" (generated link with copy button + role toggle + "Revoke" action).
- Collaborator list below both: avatar, name, email, role dropdown (owner can change role or remove), with a distinct visual treatment for the Owner row (role fixed, no remove action on self).

### 3.5 Version History Panel
- List of snapshots, newest first: relative timestamp, "last edited by X" label, "Restore" button per row.
- Restoring triggers a confirmation step (since it changes live document state) — a lightweight inline confirm ("Restore this version? Current content will be replaced.") rather than a heavy modal, since the action itself is not permanently destructive (restoring creates a new snapshot, per SRS FR-23).

## 4. Key User Flows

**Flow: Create → Share → Collaborate**
Dashboard → "New document" → Editor opens, title auto-focused → user types → clicks "Share" → Share Modal → enters collaborator email + role → "Send" → Modal closes, toast confirms → collaborator (separately) receives access and joins live.

**Flow: Join via link**
External link click → if unauthenticated: redirected to Login/Register with a "continue to document" intent preserved (e.g., via a redirect parameter) → on success, lands directly in the Editor with the link's role applied → if the role is Viewer, toolbar is absent from first paint (no flash of editable state).

**Flow: Restore a version**
Editor → History icon → panel opens → select a snapshot → "Restore" → inline confirm → panel closes → canvas updates live (for the restoring user and all other connected collaborators simultaneously).

## 5. Components (props-level detail for build reference)

```
<PresenceAvatarStack collaborators={CollaboratorPresence[]} maxVisible={3} />
  // renders up to maxVisible avatars + a "+N" overflow chip

<CollaboratorCursor userId displayName color x y selectionRange />
  // rendered inside the Tiptap editor via the collaboration-cursor extension;
  // not a standalone React component the app manages directly

<ConnectionStatusDot status={"synced"|"reconnecting"|"offline"} />

<ShareModal documentId currentCollaborators={DocumentAccessEntry[]} onInvite onGenerateLink onRevoke />

<VersionHistoryPanel documentId snapshots={SnapshotSummary[]} onRestore />

<Toolbar disabled={role === "viewer"} editor={TiptapEditorInstance} />
```

## 6. Interaction Details
- **Autosave indicator**: no explicit save button anywhere; the `ConnectionStatusDot` plus a subtle text label ("All changes saved" / "Saving…" / "Reconnecting…") communicates state passively near the title.
- **Role downgrade mid-session**: toolbar disables immediately and a toast reads "Your access changed to view-only" — never a silent change with no explanation (violates principle 4).
- **Title editing**: click-to-edit inline field, commits on blur or Enter, reverts on Escape.

## 7. Forms & Validation UX
- Login/Register: inline field-level errors (e.g., "Enter a valid email") appear on blur, not just on submit; submit button disabled until required fields are non-empty (not until fully valid — avoid over-eager disabling that hides why a button won't work).
- Share invite: email format checked client-side before enabling "Send"; server-side validation (SRS §7) is the authority regardless.

## 8. Loading / Error / Empty States

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Dashboard | Skeleton cards (3-4 placeholders) | "Create your first document" prompt | Toast: "Couldn't load documents — retry" with retry action |
| Editor (initial load) | Lightweight centered spinner until Yjs state hydrates | N/A (a doc always has at least empty content) | If document fetch 404/403: dedicated "You don't have access to this document" page, not a blank canvas |
| Editor (live connection) | N/A — never blocks editing | N/A | Non-blocking banner: "Reconnecting…" — editing continues locally per SRS FR-16 |
| Share link (invalid/revoked) | N/A | N/A | Dedicated page: "This link is no longer valid" (SRS FR-22) |

## 9. Responsive Behavior
- Breakpoint: single-column collapse below 640px.
- Dashboard: grid → single-column list.
- Editor: toolbar becomes horizontally scrollable, icon-only (no text labels) below 640px; presence avatar stack collapses to a single "+N" count badge below 480px.
- Share modal and History panel become full-screen sheets (rather than fixed-width modals/side panels) on narrow viewports.

## 10. Accessibility Checklist (targeted subset, not a formal AA audit)
These specific criteria were chosen because they have real usability impact for this app and are cheap to build in correctly from the start. This is not a claim of full WCAG 2.2 AA certification, and no automated accessibility-scanning tooling is required to meet it — a manual pass against this table is sufficient for MVP.

| Success criterion | Application in CollabNotes |
|---|---|
| 1.4.3 Contrast (Minimum) | All text/background pairs in §2.2 checked at ≥4.5:1 (body) / ≥3:1 (large text, icons) |
| 1.4.1 Use of Color | Collaborator identity always paired with initials/name, never color alone (§2.2) |
| 2.1.1 Keyboard | All toolbar buttons, modal controls, and dashboard actions reachable and operable via keyboard alone |
| 2.4.7 Focus Visible | Visible focus ring on all interactive elements, including custom-styled buttons |
| 4.1.2 Name, Role, Value | Icon-only toolbar buttons carry `aria-label` (e.g., "Bold", not just a `B` glyph with no label) |
| 3.3.1 Error Identification | Form errors are announced via associated `aria-describedby`, not color/icon alone |
| 2.2.1 Timing Adjustable | No auto-dismissing critical notices (e.g., the role-downgrade toast persists until manually dismissed, not a timed fade) |

## 11. Content/Copy Guidelines
- Error and status copy is specific and honest ("Reconnecting…" not a generic spinner with no label; "This link is no longer valid" not "Error 410").
- No jargon in user-facing copy — "Editor"/"Viewer" role names are used consistently everywhere (UI, emails, error messages), matching the SRS role vocabulary exactly to avoid confusing terminology drift between docs and product.
