import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createDocument, editor, emailFor, invite, joinAsInvited, registerFromScratch } from "./helpers.js";

async function writeSampleDocument(page: Page) {
  await editor(page).click();
  await page.keyboard.type("# Project kickoff");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A note with ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" and ");
  await page.keyboard.press("Control+i");
  await page.keyboard.type("italic");
  await page.keyboard.press("Control+i");
  await page.keyboard.type(" text.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Goals");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Ship search");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ship export");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> Make it right.");
  await expect(page.getByText("All changes saved")).toBeVisible();
}

const exportButton = (page: Page) => page.getByRole("button", { name: "Export" });

test("Download as Markdown: a .md file named after the document, with real Markdown in it", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerFromScratch(page, "Alice", { email: emailFor("Alice") });
  await createDocument(page);
  await writeSampleDocument(page);

  await exportButton(page).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download as Markdown (.md)" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("Untitled document.md");
  const md = await readFile((await download.path())!, "utf8");
  expect(md.startsWith("# Untitled document\n\n")).toBe(true);
  expect(md).toContain("# Project kickoff");
  expect(md).toContain("**bold**");
  expect(md).toMatch(/(\*|_)italic\1/);
  expect(md).toContain("## Goals");
  expect(md).toMatch(/^[-*] Ship search$/m);
  expect(md).toMatch(/^[-*] Ship export$/m);
  expect(md).toMatch(/^> Make it right\.$/m);
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible();
  await context.close();
});

test("Copy as Markdown puts the same text on the clipboard", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  await registerFromScratch(page, "Alice", { email: emailFor("Alice") });
  await createDocument(page);
  await writeSampleDocument(page);

  await exportButton(page).click();
  await page.getByRole("button", { name: "Copy as Markdown" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied Markdown" })).toBeVisible();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("# Untitled document");
  expect(clipboard).toContain("## Goals");
  expect(clipboard).toContain("**bold**");
  await context.close();
});

test("Print / PDF layout: only the title and the document remain, on white, even in dark mode", async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await registerFromScratch(page, "Alice", { email: emailFor("Alice") });
  await createDocument(page);
  await writeSampleDocument(page);

  await expect(page.locator(".editor-chrome")).toBeVisible();
  await expect(page.locator(".print-title")).toBeHidden();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".editor-chrome")).toBeHidden();
  await expect(page.locator(".print-title")).toBeVisible();
  await expect(page.locator(".print-title")).toHaveText("Untitled document");
  await expect(editor(page)).toContainText("Project kickoff");

  const colors = await page.evaluate(() => ({
    page: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.querySelector(".ProseMirror")!).color,
  }));
  expect(colors).toEqual({ page: "rgb(255, 255, 255)", text: "rgb(0, 0, 0)" });
  await context.close();
});

test("A viewer can export too, and Escape closes the menu and returns focus to the button", async ({ browser }) => {
  const owner = await browser.newContext();
  const alice = await owner.newPage();
  await registerFromScratch(alice, "Alice", { email: emailFor("Alice") });
  await createDocument(alice);
  await writeSampleDocument(alice);
  await invite(alice, emailFor("Viewer"), "Viewer");
  await alice.keyboard.press("Escape");

  const bob = await joinAsInvited(browser, "Viewer");
  await expect(bob.page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await expect(editor(bob.page)).toContainText("Project kickoff");

  await exportButton(bob.page).click();
  const [download] = await Promise.all([
    bob.page.waitForEvent("download"),
    bob.page.getByRole("button", { name: "Download as Markdown (.md)" }).click(),
  ]);
  expect(await readFile((await download.path())!, "utf8")).toContain("## Goals");

  await bob.page.keyboard.press("Escape");
  await expect(bob.page.getByRole("button", { name: "Download as Markdown (.md)" })).toHaveCount(0);
  await expect(exportButton(bob.page)).toBeFocused();

  await owner.close();
  await bob.context.close();
});
