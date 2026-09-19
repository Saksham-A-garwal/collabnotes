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
export const PASSWORD = "password123";

// Every user gets their own browser context — i.e. their own localStorage —
// which is what makes genuine two-user tests possible (two tabs of one
// context share a session).
export async function newUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

export async function register(page: Page, name: string, opts: { email?: string } = {}): Promise<void> {
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(opts.email ?? emailFor(name));
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
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
