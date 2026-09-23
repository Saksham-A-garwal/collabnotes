import { expect, test, type Page } from "@playwright/test";
import { createDocument, editor, emailFor, invite, newUser, registerFromScratch, shareButton, signIn, typeInEditor } from "./helpers.js";

const API = "http://localhost:4000/api/v1";

async function waitUntilSearchable(page: Page, term: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const token = await page.evaluate(() => localStorage.getItem("collabnotes.accessToken"));
        const res = await page.request.get(`${API}/documents/search`, { params: { q: term }, headers: { Authorization: `Bearer ${token}` } });
        return res.ok() ? ((await res.json()) as { results: unknown[] }).results.length : -1;
      },
      { timeout: 15_000, message: `"${term}" never became searchable` },
    )
    .toBeGreaterThan(0);
}

const searchBox = (page: Page) => page.getByRole("searchbox", { name: "Search your documents" });

test("Search finds words inside a document, highlights them, and shows only what you can open", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice", { email: emailFor("Alice") });
  await createDocument(alice.page);
  await typeInEditor(alice.page, "The zeppelin hangar opens in March, after the quokka survey.");
  await waitUntilSearchable(alice.page, "zeppelin");

  await alice.page.getByRole("button", { name: "Back to Dashboard" }).click();
  await searchBox(alice.page).fill("zeppelin");
  const hit = alice.page.getByRole("button", { name: /Untitled document/ }).filter({ hasText: "hangar" });
  await expect(hit).toBeVisible();
  await expect(hit.locator("mark.search-mark")).toHaveText("zeppelin");

  await searchBox(alice.page).fill("quokkas");
  await expect(hit).toBeVisible();
  await searchBox(alice.page).fill("hangar ope");
  await expect(hit).toBeVisible();

  const bob = await newUser(browser);
  await registerFromScratch(bob.page, "Bob", { email: emailFor("Bob") });
  await searchBox(bob.page).fill("zeppelin");
  await expect(bob.page.getByText("No documents match")).toBeVisible();

  await alice.page.getByRole("button", { name: /Untitled document/ }).first().click();
  await alice.page.getByText("All changes saved").waitFor();
  await invite(alice.page, emailFor("Bob"));
  await alice.page.keyboard.press("Escape");

  await searchBox(bob.page).fill("");
  await searchBox(bob.page).fill("zeppelin");
  const bobsHit = bob.page.getByRole("button", { name: /Untitled document/ }).filter({ hasText: "hangar" });
  await expect(bobsHit).toBeVisible();
  await expect(bobsHit.locator(".badge")).toHaveText("editor");

  await alice.context.close();
  await bob.context.close();
});

test("Ctrl+K opens a quick switcher: recent documents, live results, keyboard navigation", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice", { email: emailFor("Alice") });
  await createDocument(alice.page);
  await typeInEditor(alice.page, "Meeting notes about the pterodactyl budget.");
  await waitUntilSearchable(alice.page, "pterodactyl");
  await alice.page.getByRole("button", { name: "Back to Dashboard" }).click();
  await expect(alice.page.getByRole("button", { name: /Untitled document/ }).first()).toBeVisible();

  await alice.page.keyboard.press("Control+k");
  const dialog = alice.page.getByRole("dialog", { name: "Search documents" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox", { name: "Search documents" });
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("option")).toHaveCount(1);

  await input.fill("pterodactyl");
  const option = dialog.getByRole("option").filter({ hasText: "budget" });
  await expect(option).toBeVisible();
  await expect(option.locator("mark")).toHaveText("pterodactyl");
  await expect(input).toHaveAttribute("aria-activedescendant", /qs-option-/);

  await input.press("Enter");
  await expect(alice.page).toHaveURL(/\/documents\/[0-9a-f-]{36}/);
  await expect(dialog).toBeHidden();

  await alice.page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await alice.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await alice.context.close();
});

test("A query with nothing behind it says so, and search rejects one-character queries in the box", async ({ browser }) => {
  const alice = await newUser(browser);
  await registerFromScratch(alice.page, "Alice", { email: emailFor("Alice") });
  await createDocument(alice.page);
  await alice.page.getByRole("button", { name: "Back to Dashboard" }).click();

  await searchBox(alice.page).fill("qwertyuiopnothing");
  await expect(alice.page.getByText("No documents match")).toBeVisible();

  await searchBox(alice.page).fill("U");
  await expect(alice.page.getByRole("button", { name: /Untitled document/ }).first()).toBeVisible();
  await alice.context.close();
});
