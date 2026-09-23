import { expect, test, type Page } from "@playwright/test";
import { createDocument, editor, emailFor, emailTo, invite, joinAsInvited, registerFromScratch, selectWord, typeInEditor } from "./helpers.js";

const panel = (page: Page) => page.getByRole("complementary", { name: "Comments" });
const commentsButton = (page: Page) => page.getByRole("button", { name: /^Comments/ });
const floatingComment = (page: Page) => page.locator(".selection-comment-btn");

async function comment(page: Page, word: string, body: string): Promise<void> {
  await selectWord(page, word);
  await floatingComment(page).click();
  await panel(page).getByRole("combobox", { name: "Add a comment" }).fill(body);
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

  await expect(commentsButton(bob.page)).toHaveAccessibleName("Comments, 1 open");
  await expect(bob.page.locator(".comment-anchor")).toHaveText("brave");
  await commentsButton(bob.page).click();
  await expect(panel(bob.page).getByText("Is this the right word?")).toBeVisible();
  await expect(panel(bob.page).getByText("Alice").first()).toBeVisible();

  await panel(bob.page).getByRole("combobox", { name: "Reply" }).fill("Yes, keep it.");
  await panel(bob.page).getByRole("button", { name: "Reply", exact: true }).click();
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

  await editor(bob.page).click();
  await bob.page.keyboard.press("Control+Home");
  await bob.page.keyboard.type("Say: ");
  await bob.page.keyboard.press("Control+End");
  await bob.page.keyboard.type(" again");
  await expect(editor(alice)).toContainText("Say: Hello brave world again");
  await expect(alice.locator(".comment-anchor")).toHaveText("brave");
  await expect(bob.page.locator(".comment-anchor")).toHaveText("brave");

  await editor(alice).click();
  await alice.keyboard.press("Control+Home");
  await alice.keyboard.type(">> ");
  await expect(alice.locator(".comment-anchor")).toHaveText("brave");

  await selectWord(alice, "brave");
  await expect(floatingComment(alice)).toBeVisible();
  await alice.keyboard.press("Backspace");
  await expect(alice.locator(".comment-anchor")).toHaveCount(0);
  await expect(panel(alice).getByText(/has changed or been removed/)).toBeVisible();
  await expect(panel(alice).getByText("brave")).toBeVisible();

  await ownerContext.close();
  await bob.context.close();
});

test("A commenter can comment but not edit; a viewer can read comments but not add them", async ({ browser }) => {
  const { ownerContext, alice, bob: commenter } = await startShared(browser, "Commenter", "Read this carefully");

  await expect(editor(commenter.page)).toHaveAttribute("contenteditable", "false");
  await expect(commenter.page.getByRole("toolbar", { name: "Formatting" })).toHaveCount(0);
  await comment(commenter.page, "carefully", "What does this mean?");
  await expect(commenter.page.locator(".comment-anchor")).toHaveText("carefully");

  await expect(commentsButton(alice)).toHaveAccessibleName("Comments, 1 open");
  await editor(commenter.page).click();
  await commenter.page.keyboard.type("SNEAKY");
  await commenter.page.waitForTimeout(500);
  await expect(editor(alice)).toHaveText(/^Read this carefully$/);
  await expect(commenter.page.getByRole("alert")).toHaveCount(0);

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
  await expect(panel(viewer.page).getByRole("combobox")).toHaveCount(0);
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

test("Mentioning someone: suggestions, highlight, an email whose link opens the thread, and the off switch", async ({ browser }) => {
  const { ownerContext, alice, bob } = await startShared(browser, "Editor", "Please review the launch plan");
  const editorEmail = emailFor("Editor");
  await bob.page.goto("/");
  await expect(bob.page.getByRole("button", { name: "New document" }).first()).toBeVisible();

  await selectWord(alice, "launch");
  await floatingComment(alice).click();
  const box = panel(alice).getByRole("combobox", { name: "Add a comment" });
  await box.pressSequentially("@Al");
  await expect(alice.getByRole("listbox", { name: "People to mention" })).toHaveCount(0);
  await box.fill("");
  await box.pressSequentially("@Ed");
  await expect(alice.getByRole("option", { name: "Editor" })).toBeVisible();
  await box.press("Enter");
  await expect(box).toHaveValue("@Editor ");
  await box.pressSequentially("could you check this?");
  await panel(alice).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel(alice).locator(".mention", { hasText: "@Editor" })).toBeVisible();

  await expect
    .poll(async () => (await emailTo(alice, editorEmail))?.subject ?? "", { timeout: 10_000 })
    .toMatch(/Alice mentioned you in/);
  const mail = (await emailTo(alice, editorEmail))!;
  const link = new URL(mail.text.match(/View it: (\S+)/)![1]!);
  await bob.page.goto(link.pathname + link.search);
  await expect(panel(bob.page)).toBeVisible();
  await expect(panel(bob.page).locator(".thread.is-active")).toContainText("could you check this?");
  await expect(bob.page.locator(".comment-anchor.is-active")).toHaveText("launch");

  await bob.page.goto("/");
  await bob.page.getByRole("button", { name: "Account menu" }).click();
  await bob.page.getByLabel("Email me when I’m mentioned").click();
  await expect(bob.page.getByLabel("Email me when I’m mentioned")).not.toBeChecked();
  await bob.page.reload();
  await bob.page.getByRole("button", { name: "Account menu" }).click();
  await expect(bob.page.getByLabel("Email me when I’m mentioned")).not.toBeChecked();

  await selectWord(alice, "plan");
  await floatingComment(alice).click();
  const second = panel(alice).getByRole("combobox", { name: "Add a comment" });
  await second.pressSequentially("@Ed");
  await second.press("Enter");
  await second.pressSequentially("and this one too");
  await panel(alice).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel(alice).getByText("and this one too")).toBeVisible();
  await alice.waitForTimeout(1500);
  expect((await emailTo(alice, editorEmail))!.text).toBe(mail.text);

  await ownerContext.close();
  await bob.context.close();
});

async function mentionEditor(page: Page, word: string, text: string): Promise<void> {
  await selectWord(page, word);
  await floatingComment(page).click();
  const box = panel(page).getByRole("combobox", { name: "Add a comment" });
  await box.pressSequentially("@Ed");
  await box.press("Enter");
  await box.pressSequentially(text);
  await panel(page).getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel(page).getByText(text)).toBeVisible();
}

test("The bell: a mention lights it up live, opens the thread, and mark-all-read sticks", async ({ browser }) => {
  const { ownerContext, alice, bob } = await startShared(browser, "Editor", "Please review the launch plan today");
  const bell = (page: Page, name: string | RegExp) => page.getByRole("button", { name });

  await expect(bell(bob.page, "Notifications")).toBeVisible();
  await mentionEditor(alice, "launch", "first question for you");
  await expect(bell(bob.page, "Notifications, 1 unread")).toBeVisible();

  await bell(bob.page, "Notifications, 1 unread").click();
  const list = bob.page.getByRole("region", { name: "Notifications" });
  await expect(list).toContainText("Alice mentioned you in");
  await expect(list).toContainText("first question for you");
  await list.getByRole("button", { name: /first question for you/ }).click();
  await expect(panel(bob.page).locator(".thread.is-active")).toContainText("first question for you");
  await expect(bell(bob.page, "Notifications")).toBeVisible();

  await mentionEditor(alice, "plan", "second question for you");
  await expect(bell(bob.page, "Notifications, 1 unread")).toBeVisible();
  await bob.page.goto("/");
  await expect(bell(bob.page, "Notifications, 1 unread")).toBeVisible();
  await bell(bob.page, "Notifications, 1 unread").click();
  await bob.page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(bell(bob.page, "Notifications")).toBeVisible();
  await bob.page.reload();
  await expect(bell(bob.page, "Notifications")).toBeVisible();
  await expect(bell(bob.page, /unread/)).toHaveCount(0);

  await bell(bob.page, "Notifications").click();
  await bob.page.getByRole("region", { name: "Notifications" }).getByRole("button", { name: /second question for you/ }).click();
  await bob.page.waitForURL(/\/documents\/[0-9a-f-]{36}\?thread=/);
  await expect(panel(bob.page).locator(".thread.is-active")).toContainText("second question for you");

  await ownerContext.close();
  await bob.context.close();
});
