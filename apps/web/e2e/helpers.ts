import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const RUN = Date.now().toString(36);

function hash(text: string): string {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

export const emailFor = (name: string) => `${name.toLowerCase()}.${RUN}.${hash(test.info().title)}@e2e.test`;

const API = "http://localhost:4000/api/v1";

export async function newUser(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

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

export async function signIn(page: Page, email: string, opts: { name?: string } = {}): Promise<void> {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Verification code").fill(await codeFor(page, email));

  const nameField = page.getByLabel("Your name");
  await expect
    .poll(async () => (await nameField.isVisible()) || !page.url().includes("/login"), { timeout: 15_000 })
    .toBe(true);
  if (await nameField.isVisible()) {
    await nameField.fill(opts.name ?? "");
    await page.getByRole("button", { name: /^Continue/ }).click();
  }
}

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

export async function selectWord(page: Page, word: string): Promise<void> {
  await page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector(".ProseMirror")!, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent!.indexOf(w);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + w.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    throw new Error(`"${w}" not found`);
  }, word);
}

export const shareButton = (page: Page) => page.getByRole("button", { name: "Share", exact: true });
export const shareDialog = (page: Page) => page.getByRole("dialog", { name: "Share document" });

export async function invite(page: Page, email: string, role: "Editor" | "Commenter" | "Viewer" = "Editor"): Promise<void> {
  await shareButton(page).click();
  const dialog = shareDialog(page);
  await dialog.getByLabel("Invite by email").fill(email);
  await dialog.getByLabel("Role for invite").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(email).first()).toBeVisible();
}

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

export async function emailTo(page: Page, address: string): Promise<{ subject: string; text: string } | null> {
  const res = await page.request.get(`${API}/dev/outbox`, { params: { to: address } });
  return res.ok() ? ((await res.json()) as { subject: string; text: string }) : null;
}
