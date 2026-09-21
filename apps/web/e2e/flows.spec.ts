import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createDocument,
  editor,
  emailFor,
  expectDocText,
  newUser,
  register,
  registerFromScratch,
  typeInEditor,
} from "./helpers.js";

const shareButton = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
const shareDialog = (page: Page) => page.getByRole("dialog", { name: "Share document" });

async function invite(page: Page, email: string, role: "Editor" | "Viewer" = "Editor"): Promise<void> {
  await shareButton(page).click();
  const dialog = shareDialog(page);
  await dialog.getByLabel("Invite by email").fill(email);
  await dialog.getByLabel("Role for invite").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(email).first()).toBeVisible();
}

// Registers a user with an already-invited email and opens the shared document.
async function joinAsInvited(browser: Browser, name: string) {
  const user = await newUser(browser);
  await registerFromScratch(user.page, name);
  await user.page.getByRole("button", { name: /Untitled document/ }).first().click();
  await user.page.waitForURL(/\/documents\//);
  await expect(user.page.getByText("All changes saved")).toBeVisible();
  return user;
}

// UIUX §4 — "Create → Share → Collaborate"
test("Create → Share → Collaborate", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);
  await typeInEditor(alice.page, "Hello from Alice.");

  // Invite someone who has no account yet (FR-19): shown as pending.
  await invite(alice.page, emailFor("Bob"));
  await expect(shareDialog(alice.page).getByText("(pending)")).toBeVisible();
  await alice.page.keyboard.press("Escape");

  // Bob registers with that email; the pending invite becomes real access.
  const bob = await joinAsInvited(browser, "Bob");
  await expectDocText(bob.page, "Hello from Alice.");

  // Both directions, live.
  await typeInEditor(bob.page, " And Bob.");
  await expectDocText(alice.page, "Hello from Alice. And Bob.");

  // Presence: each sees the other's labeled avatar (never color alone).
  await expect(alice.page.getByTitle("Bob")).toBeVisible();
  await expect(bob.page.getByTitle("Alice")).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});

// UIUX §4 — "Join via link" (FR-18, FR-21, FR-22)
test("Join via link: login redirect, viewer is read-only, revoked link is a clear dead end", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);
  await typeInEditor(alice.page, "Read me.");

  await shareButton(alice.page).click();
  const dialog = shareDialog(alice.page);
  await dialog.getByLabel("Role for share link").selectOption({ label: "Viewer" });
  await dialog.getByRole("button", { name: "Create link" }).click();
  const link = await dialog.getByLabel("Share link URL").inputValue();
  expect(link).toMatch(/\/share\/[0-9a-f]{64}$/);

  // Unauthenticated visitor → login with the intent preserved → resumes into the doc.
  const carol = await newUser(browser);
  await carol.page.goto(link);
  await expect(carol.page).toHaveURL(/\/login\?redirect=%2Fshare%2F/);
  await register(carol.page, "Carol");
  await expect(carol.page).toHaveURL(/\/documents\//);
  await expectDocText(carol.page, "Read me.");

  // Viewer: no toolbar from first paint, and typing changes nothing.
  await expect(carol.page.getByRole("toolbar")).toHaveCount(0);
  await expect(editor(carol.page)).toHaveAttribute("contenteditable", "false");
  await editor(carol.page).click();
  await carol.page.keyboard.type("SHOULD NOT APPEAR");
  await expectDocText(carol.page, "Read me.");
  await expectDocText(alice.page, "Read me.");

  // Owner revokes the link; the next visitor gets an honest message (FR-22).
  await dialog.getByRole("button", { name: "Revoke" }).click();
  const dave = await newUser(browser);
  await dave.page.goto(link);
  await register(dave.page, "Dave");
  await expect(dave.page.getByText("This link is no longer valid.")).toBeVisible();

  await Promise.all([alice.context.close(), carol.context.close(), dave.context.close()]);
});

// UIUX §4 — "Restore a version" (FR-23, FR-25)
test("Restore a version: live for everyone, no reload", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  const docPath = await createDocument(alice.page);
  await typeInEditor(alice.page, "Original");
  await invite(alice.page, emailFor("Bob"));
  await alice.page.keyboard.press("Escape");
  const bob = await joinAsInvited(browser, "Bob");
  await expectDocText(bob.page, "Original");

  // Wait for the periodic snapshot job (2s interval in this config).
  const token = await alice.page.evaluate(() => localStorage.getItem("collabnotes.accessToken"));
  await expect
    .poll(
      async () => {
        const res = await alice.page.request.get(`http://localhost:4000/api/v1${docPath}/snapshots`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return (await res.json()).snapshots.length;
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  await typeInEditor(alice.page, " ABANDONED");
  await expectDocText(bob.page, "Original ABANDONED");

  // Proves no page reload on Bob's side across the restore.
  await bob.page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  await alice.page.getByRole("button", { name: "History" }).click();
  const panel = alice.page.getByRole("dialog", { name: "Version history" });
  await panel.getByRole("button", { name: /^Restore version/ }).last().click(); // oldest
  await expect(panel.getByText("Restore this version? Current content will be replaced.")).toBeVisible();
  await panel.getByRole("button", { name: "Confirm" }).click();

  await expectDocText(alice.page, "Original");
  await expectDocText(bob.page, "Original");
  expect(await bob.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // The restore itself is a new entry in history, credited to who did it.
  await alice.page.getByRole("button", { name: "History" }).click();
  await expect(alice.page.getByRole("dialog", { name: "Version history" }).getByText("Saved by Alice")).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});

// SRS §8 edge case + UIUX §6: role downgraded mid-session.
test("Role change mid-session: toolbar disables, a persistent notice explains, removal ends the session", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);
  await invite(alice.page, emailFor("Bob"), "Editor");
  const bob = await joinAsInvited(browser, "Bob");
  await expect(bob.page.getByRole("toolbar")).toBeVisible();

  // Alice downgrades Bob to Viewer while he has the document open.
  await alice.page.getByLabel(`Role for ${emailFor("Bob")}`).selectOption({ label: "Viewer" });

  await expect(bob.page.getByText("Your access changed to view-only.")).toBeVisible();
  await expect(bob.page.getByRole("toolbar")).toHaveCount(0);
  await expect(editor(bob.page)).toHaveAttribute("contenteditable", "false");

  // Persistent (WCAG 2.2.1): still there after a while, until dismissed.
  await bob.page.waitForTimeout(6000);
  await expect(bob.page.getByText("Your access changed to view-only.")).toBeVisible();
  await bob.page.getByRole("button", { name: "Dismiss" }).click();
  await expect(bob.page.getByText("Your access changed to view-only.")).toHaveCount(0);

  // Removal ends the session with an explanation.
  await alice.page.getByRole("button", { name: `Remove ${emailFor("Bob")}` }).click();
  await expect(bob.page.getByText("Your access to this document was removed.")).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});

// UIUX §10: keyboard operability, focus management, labelled controls.
test("Keyboard: Share dialog takes focus, traps Tab, and returns focus on Escape", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);

  const button = shareButton(alice.page);
  await button.focus();
  await alice.page.keyboard.press("Enter");
  const dialog = shareDialog(alice.page);
  await expect(dialog).toBeVisible();

  const insideDialog = () =>
    alice.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  expect(await insideDialog()).toBe(true);

  // Tab far more times than there are controls: focus must never leave.
  for (let i = 0; i < 25; i++) {
    await alice.page.keyboard.press("Tab");
    expect(await insideDialog()).toBe(true);
  }
  for (let i = 0; i < 25; i++) {
    await alice.page.keyboard.press("Shift+Tab");
    expect(await insideDialog()).toBe(true);
  }

  await alice.page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();

  // Every toolbar control has an accessible name (4.1.2).
  for (const name of ["Bold", "Italic", "Underline", "Heading level", "Bullet list", "Numbered list", "Link"]) {
    await expect(alice.page.getByRole("toolbar", { name: "Formatting" }).getByLabel(name)).toBeVisible();
  }

  await alice.context.close();
});

// UIUX §9: narrow viewports.
test("Responsive: no horizontal overflow at 375px, avatar stack collapses to +N, history is a full-width sheet", async ({ browser }) => {
  const alice = await newUser(browser);
  await alice.page.setViewportSize({ width: 375, height: 800 });
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);
  await invite(alice.page, emailFor("Bob"));
  await alice.page.keyboard.press("Escape");
  const bob = await joinAsInvited(browser, "Bob");

  const noOverflow = () =>
    alice.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noOverflow()).toBe(true);

  // Below 480px the presence stack is a single "+N" badge, not avatars.
  await expect(alice.page.getByLabel("1 more collaborator")).toBeVisible();
  await expect(alice.page.getByTitle("Bob")).toHaveCount(0);

  await alice.page.getByRole("button", { name: "History" }).click();
  const box = await alice.page.getByRole("dialog", { name: "Version history" }).boundingBox();
  expect(Math.round(box!.width)).toBe(375);
  await alice.page.keyboard.press("Escape");

  // Dashboard too.
  await alice.page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(alice.page.getByRole("button", { name: "New document" }).first()).toBeVisible();
  expect(await noOverflow()).toBe(true);

  await alice.context.close();
  await bob.context.close();
});

// FR-5 (rich text) + FR-15 (presence). Guards the editor stack itself: the
// toolbar must follow the selection, marks must sync live through Yjs, and a
// collaborator's caret must render with their name.
test("Rich text: toolbar follows the selection, formatting syncs live, carets are labeled", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice");
  await createDocument(alice.page);
  await invite(alice.page, emailFor("Bob"));
  await alice.page.keyboard.press("Escape");
  const bob = await joinAsInvited(browser, "Bob");

  const a = alice.page;
  const btn = (name: string) => a.getByRole("button", { name, exact: true });
  const heading = a.getByLabel("Heading level");
  // A toolbar action hands focus back to the editor asynchronously; keys
  // pressed before that lands go to the button instead. Wait for it.
  const press = async (name: string) => {
    await btn(name).click();
    await expect(editor(a)).toBeFocused();
  };
  // Arrow/Home keys move the DOM selection first and ProseMirror picks it up
  // on the next selectionchange. Pressing faster than that races the editor,
  // which no person can do — so after each key, let two frames pass.
  const key = async (k: string, times = 1) => {
    for (let i = 0; i < times; i++) {
      await a.keyboard.press(k);
      await a.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    }
  };

  // Line 1: bold, then plain, then underlined. Each button reports its state.
  await editor(a).click();
  await expect(btn("Bold")).toHaveAttribute("aria-pressed", "false");
  await press("Bold");
  await expect(btn("Bold")).toHaveAttribute("aria-pressed", "true");
  await a.keyboard.type("Bold");
  await press("Bold");
  await expect(btn("Bold")).toHaveAttribute("aria-pressed", "false");
  await a.keyboard.type(" plain ");
  await press("Underline");
  await expect(btn("Underline")).toHaveAttribute("aria-pressed", "true");
  await a.keyboard.type("under");
  await press("Underline");

  // Line 2: a link over selected text (Link ships inside StarterKit in v3).
  await key("Enter");
  await a.keyboard.type("site");
  await key("Shift+Home");
  a.once("dialog", (d) => d.accept("https://example.com"));
  await press("Link");
  await expect(editor(a).locator('a[href="https://example.com"]')).toHaveText("site");
  await key("End"); // collapse the selection before typing on

  // Line 3: a heading.
  await key("Enter");
  await heading.selectOption("2");
  await expect(heading).toHaveValue("2");
  await expect(editor(a)).toBeFocused();
  await a.keyboard.type("Title");
  await expect(editor(a).locator("h2")).toContainText("Title");

  // Everything above reached Bob live, as real marks/nodes — not flattened text.
  const bobDoc = editor(bob.page);
  await expect(bobDoc.locator("strong")).toHaveText("Bold");
  await expect(bobDoc.locator("u")).toHaveText("under");
  // toContainText below: Alice's caret label renders inside whichever element
  // her cursor is in, in Bob's view.
  await expect(bobDoc.locator('a[href="https://example.com"]').first()).toContainText("site");
  await expect(bobDoc.locator("h2")).toContainText("Title");

  // The toolbar tracks the caret, not just the last click: walk it back up
  // through the document and each control must update on its own.
  await key("ArrowUp");
  await key("Home");
  await key("ArrowRight", 2); // strictly inside "site" — link marks aren't inclusive at their edges
  await expect(btn("Link")).toHaveAttribute("aria-pressed", "true");
  await expect(heading).toHaveValue("0");
  await key("ArrowUp");
  await key("Home");
  await key("ArrowRight", 2); // inside "Bold"
  await expect(btn("Bold")).toHaveAttribute("aria-pressed", "true");
  await expect(btn("Link")).toHaveAttribute("aria-pressed", "false");
  await key("ArrowDown", 2);
  await expect(heading).toHaveValue("2");

  // Carets: each collaborator sees the other's name at their cursor.
  await editor(bob.page).click();
  await expect(a.locator(".collaboration-cursor__label", { hasText: "Bob" })).toBeVisible();
  await expect(bob.page.locator(".collaboration-cursor__label", { hasText: "Alice" })).toBeVisible();

  await alice.context.close();
  await bob.context.close();
});
