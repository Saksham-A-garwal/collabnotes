import { expect, test } from "@playwright/test";
import { createDocument, editor, emailFor, invite, joinAsInvited, registerFromScratch } from "./helpers.js";

// Regression: Yjs puts the document's whole "delete set" in every sync message,
// so for any document where text was ever deleted the handshake "diff" is never
// empty. A viewer's browser used to send it, the server (correctly) refused a
// write from a read-only role, and the viewer was shown "Viewers cannot edit
// this document" just for opening the page. A viewer's browser now sends nothing.
test("A viewer opening a document that has editing history sees no error", async ({ browser }) => {
  const owner = await browser.newContext();
  const alice = await owner.newPage();
  await registerFromScratch(alice, "Alice", { email: emailFor("Alice") });
  await createDocument(alice);
  await editor(alice).click();
  // Markdown shortcuts delete the characters typed to trigger them, so this
  // document has real deletion history, and it ends in a list and a quote.
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
  await bob.page.waitForTimeout(2000); // the bogus error used to appear about a second after joining
  await expect(bob.page.getByRole("alert")).toHaveCount(0);
  await expect(editor(bob.page)).toHaveAttribute("contenteditable", "false"); // and they really are read-only

  // Reload: the reconnect handshake must be quiet too.
  await bob.page.reload();
  await expect(editor(bob.page)).toContainText("a closing quote");
  await bob.page.waitForTimeout(1500);
  await expect(bob.page.getByRole("alert")).toHaveCount(0);

  await owner.close();
  await bob.context.close();
});
