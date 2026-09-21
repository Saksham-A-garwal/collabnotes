import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const RUN = Date.now().toString(36);

function hash(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

// Unique per run *and* per test, so "Bob" in one test never collides with
// "Bob" in another (the database isn't reset between tests). Call it from
// inside a test body.
export const emailFor = (name: string) => `${name.toLowerCase()}.${RUN}.${hash(test.info().title)}@e2e.test`;

// The API runs with EMAIL_TRANSPORT=outbox under Playwright (see
// playwright.config.ts): instead of sending mail it keeps the last messages in
// memory and lets the test read them, so the whole sign-in flow — request a
// code, receive it, type it — runs for real.
const API = "http://localhost:4000/api/v1";

// Every user gets their own browser context — i.e. their own localStorage —
// which is what makes genuine two-user tests possible (two tabs of one
// context share a session).
export async function newUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

// Reads the sign-in code most recently "emailed" to an address.
export async function codeFor(page: Page, email: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`${API}/dev/outbox`, { params: { to: email } });
        code = res.ok() ? ((await res.json()) as { code: string | null }).code : null;
        return code;
      },
      { timeout: 10_000, message: `no sign-in email arrived for ${email}` },
    )
    .not.toBeNull();
  return code!;
}

// Starts on the login screen's email step. Enters the address, then the code
// from the inbox (which submits itself at six digits). A brand-new account then
// lands on the "what should we call you?" step, which this completes with
// `name`; a returning user is signed straight in.
export async function signIn(page: Page, email: string, opts: { name?: string } = {}): Promise<void> {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Verification code").fill(await codeFor(page, email));

  const nameField = page.getByLabel("Your name");
  // Either the name step appears (new account) or we leave /login (returning user).
  await expect
    .poll(async () => (await nameField.isVisible()) || !page.url().includes("/login"), { timeout: 15_000 })
    .toBe(true);
  if (await nameField.isVisible()) {
    await nameField.fill(opts.name ?? "");
    await page.getByRole("button", { name: /^Continue/ }).click();
  }
}

// Creates an account for `name` (or signs in, if the address already exists).
export async function register(page: Page, name: string, opts: { email?: string } = {}): Promise<void> {
  await signIn(page, opts.email ?? emailFor(name), { name });
}

export async function registerFromScratch(page: Page, name: string, opts: { email?: string } = {}): Promise<void> {
  await page.goto("/login");
  await register(page, name, opts);
}

export async function createDocument(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New document" }).first().click();
  await page.waitForURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(page.getByText("All changes saved")).toBeVisible();
  return new URL(page.url()).pathname;
}

export const editor = (page: Page) => page.locator(".ProseMirror");

// The document's text without collaborator cursor labels — Tiptap renders a
// remote user's name *inside* the paragraph, so a plain textContent
// comparison would include "Alice"/"Bob".
export async function docText(page: Page): Promise<string> {
  return editor(page).evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".collaboration-cursor__caret").forEach((n) => n.remove());
    return clone.textContent ?? "";
  });
}

export async function expectDocText(page: Page, text: string): Promise<void> {
  await expect.poll(() => docText(page), { timeout: 10_000 }).toBe(text);
}

export async function typeInEditor(page: Page, text: string): Promise<void> {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(text);
}

export const shareButton = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
export const shareDialog = (page: Page) => page.getByRole("dialog", { name: "Share document" });

export async function invite(page: Page, email: string, role: "Editor" | "Viewer" = "Editor"): Promise<void> {
  await shareButton(page).click();
  const dialog = shareDialog(page);
  await dialog.getByLabel("Invite by email").fill(email);
  await dialog.getByLabel("Role for invite").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(email).first()).toBeVisible();
}

// Registers a user with an already-invited email and opens the shared document.
export async function joinAsInvited(browser: Browser, name: string, opts: { colorScheme?: "light" | "dark" } = {}) {
  const context = await browser.newContext({ colorScheme: opts.colorScheme });
  const page = await context.newPage();
  const user = { context, page };
  await registerFromScratch(user.page, name);
  await user.page.getByRole("button", { name: /Untitled document/ }).first().click();
  await user.page.waitForURL(/\/documents\//);
  await expect(user.page.getByText("All changes saved")).toBeVisible();
  return user;
}
