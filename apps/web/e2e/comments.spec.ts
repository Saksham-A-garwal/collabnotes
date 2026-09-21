import { expect, test, type Page } from "@playwright/test";
import { createDocument, editor, emailFor, invite, joinAsInvited, registerFromScratch, selectWord, typeInEditor } from "./helpers.js";

const panel = (page: Page) => page.getByRole("complementary", { name: "Comments" });
const commentsButton = (page: Page) => page.getByRole("button", { name: /^Comments/ });
const floatingComment = (page: Page) => page.locator(".selection-comment-btn");

async function comment(page: Page, word: string, body: string): Promise<void> {
  await selectWord(page, word);
  await floatingComment(page).click();
  await panel(page).getByRole("textbox", { name: "Add a comment" }).fill(body);
  await panel(page).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel(page).getByText(body)).toBeVisible();
}

async function startShared(browser: import("@playwright/test").Browser, role: "Editor" | "Commenter" | "Viewer", text: string) {
  const ownerContext = await browser.newContext();
  const alice = await ownerContext.newPage();
  await registerFromScratch(alice, "Alice", { email: emailFor("Alice") });
  await createDocument(alice);
  await typeInEditor(alice, text);
  await expect(alice.getByText("All changes saved")).toBeVisible();
  await invite(alice, emailFor(role), role);
  await alice.keyboard.press("Escape");
  const bob = await joinAsInvited(browser, role);
  await expect(editor(bob.page)).toContainText(text);
  return { ownerContext, alice, bob };
}

test("Comment on some text: the other person sees it live, replies, and resolving it clears it for both", async ({ browser }) => {
  const { ownerContext, alice, bob } = await startShared(browser, "Editor", "Hello brave world");

  await comment(alice, "brave", "Is this the right word?");
  await expect(alice.locator(".comment-anchor")).toHaveText("brave");

  // Bob never opened anything: the header just says there is one open comment.
  await expect(commentsButton(bob.page)).toHaveAccessibleName("Comments, 1 open");
  await expect(bob.page.locator(".comment-anchor")).toHaveText("brave");
  await commentsButton(bob.page).click();
  await expect(panel(bob.page).getByText("Is this the right word?")).toBeVisible();
  await expect(panel(bob.page).getByText("Alice").first()).toBeVisible();

  await panel(bob.page).getByRole("textbox", { name: "Reply" }).fill("Yes, keep it.");
  await panel(bob.page).getByRole("button", { name: "Reply", exact: true }).click();
  // Alice's panel is still open from writing the comment, and the reply arrives in it.
  await expect(panel(alice).getByText("Yes, keep it.")).toBeVisible();

  await panel(alice).getByRole("button", { name: "Resolve" }).click();
  await expect(commentsButton(alice)).toHaveAccessibleName("Comments");
  await expect(commentsButton(bob.page)).toHaveAccessibleName("Comments");
  await expect(alice.locator(".comment-anchor")).toHaveCount(0);
  await expect(bob.page.locator(".comment-anchor")).toHaveCount(0);
  await expect(panel(bob.page).getByRole("button", { name: /Show resolved \(1\)/ })).toBeVisible();

  await ownerContext.close();
  await bob.context.close();
});

test("A comment stays on its words while other people type around it, and notices when they are deleted", async ({ browser }) => {
  const { ownerContext, alice, bob } = await startShared(browser, "Editor", "Hello brave world");
  await comment(alice, "brave", "Check this");

  // Bob types before, after and inside the paragraph.
  await editor(bob.page).click();
  await bob.page.keyboard.press("Control+Home");
  await bob.page.keyboard.type("Say: ");
  await bob.page.keyboard.press("Control+End");
  await bob.page.keyboard.type(" again");
  await expect(editor(alice)).toContainText("Say: Hello brave world again");
  await expect(alice.locator(".comment-anchor")).toHaveText("brave");
  await expect(bob.page.locator(".comment-anchor")).toHaveText("brave");

  // Alice's own typing before it, too.
  await editor(alice).click();
  await alice.keyboard.press("Control+Home");
  await alice.keyboard.type(">> ");
  await expect(alice.locator(".comment-anchor")).toHaveText("brave");

  // Deleting the words leaves the thread, saying its text is gone.
  await selectWord(alice, "brave");
  await alice.keyboard.press("Backspace");
  await expect(alice.locator(".comment-anchor")).toHaveCount(0);
  await expect(panel(alice).getByText(/has changed or been removed/)).toBeVisible();
  await expect(panel(alice).getByText("brave")).toBeVisible(); // the saved quote

  await ownerContext.close();
  await bob.context.close();
});

test("A commenter can comment but not edit; a viewer can read comments but not add them", async ({ browser }) => {
  const { ownerContext, alice, bob: commenter } = await startShared(browser, "Commenter", "Read this carefully");

  // The commenter's editor is read-only and has no formatting toolbar…
  await expect(editor(commenter.page)).toHaveAttribute("contenteditable", "false");
  await expect(commenter.page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  // …but they can still comment.
  await comment(commenter.page, "carefully", "What does this mean?");
  await expect(commenter.page.locator(".comment-anchor")).toHaveText("carefully");

  // Alice sees it, and the commenter's typing did nothing to her document.
  await expect(commentsButton(alice)).toHaveAccessibleName("Comments, 1 open");
  await editor(commenter.page).click();
  await commenter.page.keyboard.type("SNEAKY");
  await commenter.page.waitForTimeout(500);
  await expect(editor(alice)).toHaveText(/^Read this carefully$/);
  await expect(commenter.page.getByRole("alert")).toHaveCount(0);

  // A viewer of the same document sees the thread, with nothing to write in.
  await alice.getByRole("button", { name: "Share", exact: true }).click();
  const viewerEmail = emailFor("Viewer");
  const dialog = alice.getByRole("dialog", { name: "Share document" });
  await dialog.getByLabel("Invite by email").fill(viewerEmail);
  await dialog.getByLabel("Role for invite").selectOption({ label: "Viewer" });
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText(viewerEmail).first()).toBeVisible();
  await alice.keyboard.press("Escape");

  const viewer = await joinAsInvited(browser, "Viewer");
  await expect(commentsButton(viewer.page)).toHaveAccessibleName("Comments, 1 open");
  await commentsButton(viewer.page).click();
  await expect(panel(viewer.page).getByText("What does this mean?")).toBeVisible();
  await expect(panel(viewer.page).getByRole("textbox")).toHaveCount(0);
  await expect(panel(viewer.page).getByRole("button", { name: "Resolve" })).toHaveCount(0);
  await selectWord(viewer.page, "Read");
  await expect(floatingComment(viewer.page)).toHaveCount(0);

  await ownerContext.close();
  await commenter.context.close();
  await viewer.context.close();
});

test("Comment text is shown as plain text, never as markup", async ({ browser }) => {
  const { ownerContext, alice, bob } = await startShared(browser, "Editor", "Some words here");
  await comment(alice, "words", "<img src=x onerror=\"window.__pwned=1\"> **not bold**");
  await commentsButton(bob.page).click();
  await expect(panel(bob.page).getByText("<img src=x onerror=", { exact: false })).toBeVisible();
  await expect(panel(bob.page).locator("img")).toHaveCount(0);
  await expect(panel(bob.page).locator("strong", { hasText: "not bold" })).toHaveCount(0);
  expect(await bob.page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();

  await ownerContext.close();
  await bob.context.close();
});
