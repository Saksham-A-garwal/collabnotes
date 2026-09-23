import { expect, test } from "@playwright/test";
import { createDocument, editor, emailFor, invite, joinAsInvited, registerFromScratch } from "./helpers.js";

test("A viewer opening a document that has editing history sees no error", async ({ browser }) => {
  const owner = await browser.newContext();
  const alice = await owner.newPage();
  await registerFromScratch(alice, "Alice", { email: emailFor("Alice") });
  await createDocument(alice);
  await editor(alice).click();
  await alice.keyboard.type("Meeting notes");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("- first item");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("second item");
  await alice.keyboard.press("Enter");
  await alice.keyboard.press("Enter");
  await alice.keyboard.type("> a closing quote");
  await expect(alice.getByText("All changes saved")).toBeVisible();

  await invite(alice, emailFor("Viewer"), "Viewer");
  await alice.keyboard.press("Escape");

  const bob = await joinAsInvited(browser, "Viewer");
  await expect(editor(bob.page)).toContainText("a closing quote");
  await bob.page.waitForTimeout(2000);
  await expect(bob.page.getByRole("alert")).toHaveCount(0);
  await expect(editor(bob.page)).toHaveAttribute("contenteditable", "false");

  await bob.page.reload();
  await expect(editor(bob.page)).toContainText("a closing quote");
  await bob.page.waitForTimeout(1500);
  await expect(bob.page.getByRole("alert")).toHaveCount(0);

  await owner.close();
  await bob.context.close();
});
